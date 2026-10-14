import { changeAccount } from '@/lib/accountState'
import { activateSync } from '@/lib/sync'
import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

interface AuthState {
  user: User | null
  profile: { name: string } | null
  isLoading: boolean
  error: string | null
  initialised: boolean
  init: () => Promise<void>
  login: (email: string, password: string) => Promise<void>
  signup: (name: string, email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  clearError: () => void
}

let initPromise: Promise<void> | null = null

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  profile: null,
  isLoading: false,
  error: null,
  initialised: false,

  // The auth callback must return synchronously: awaiting a database call here
  // deadlocks the SDK's session lock. Profile loading runs outside that lock.
  init: () => {
    if (initPromise) return initPromise
    const applyUser = (user: User | null) => {
      const changed = useAuthStore.getState().user?.id !== user?.id
      changeAccount(user?.id ?? null)
      set({ user, initialised: true, ...(changed ? { profile: null } : {}) })
      setTimeout(() => {
        if (useAuthStore.getState().user?.id !== user?.id) return
        activateSync(user?.id ?? null)
        if (user) void supabase.from('profiles').select('name').eq('id', user.id).single().then(({ data }) => {
          if (useAuthStore.getState().user?.id === user.id) set({ profile: data })
        })
      }, 0)
    }
    // One listener for the lifetime of the app, including development Strict Mode.
    supabase.auth.onAuthStateChange((_event, session) => {
      activateSync(null) // pause writes immediately on token/account transitions
      applyUser(session?.user ?? null)
    })
    initPromise = (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        applyUser(session?.user ?? null)
      } catch { set({ initialised: true }) }
    })()
    return initPromise
  },

  login: async (email, password) => {
    set({ isLoading: true, error: null })
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      set({ error: error.message, isLoading: false })
    } else {
      set({ isLoading: false })
    }
  },

  signup: async (name, email, password) => {
    set({ isLoading: true, error: null })
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    })
    if (error) {
      set({ error: error.message, isLoading: false })
    } else {
      set({ isLoading: false })
    }
  },

  logout: async () => {
    const { error } = await supabase.auth.signOut()
    if (error) { set({ error: error.message }); return }
    activateSync(null)
    changeAccount(null)
    set({ user: null, profile: null })
  },

  clearError: () => set({ error: null }),
}))
