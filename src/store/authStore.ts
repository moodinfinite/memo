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

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  profile: null,
  isLoading: false,
  error: null,
  initialised: false,

  // Call once on app mount — restores session from localStorage automatically
  init: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user ?? null

    let profile = null
    if (user) {
      const { data } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', user.id)
        .single()
      profile = data
    }

    set({ user, profile, initialised: true })

    // Listen for auth changes (token refresh, logout from another tab, etc.)
    supabase.auth.onAuthStateChange(async (_event, session) => {
      const u = session?.user ?? null
      let p = null
      if (u) {
        const { data } = await supabase.from('profiles').select('name').eq('id', u.id).single()
        p = data
      }
      set({ user: u, profile: p })
    })
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
    await supabase.auth.signOut()
    set({ user: null, profile: null })
  },

  clearError: () => set({ error: null }),
}))
