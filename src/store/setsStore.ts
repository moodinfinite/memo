import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { FlashcardSet, Card } from '@/lib/database.types'
import { sanitizeText, sanitizeCard, escapeIlike } from '@/lib/sanitize'
import { useAuthStore } from './authStore'

interface SetsState {
  sets: FlashcardSet[]
  currentSet: FlashcardSet | null
  isLoading: boolean
  error: string | null
  setsLastFetched: number        // timestamp — skip refetch if recent
  currentSetFetchedAt: number    // timestamp — skip refetch if same ID + recent
  fetchSets: () => Promise<void>
  fetchSet: (id: string) => Promise<void>
  createSet: (title: string, description: string, cards: Omit<Card, 'id' | 'set_id' | 'user_id'>[], folderId?: string | null) => Promise<FlashcardSet>
  updateSet: (id: string, title: string, description: string, cards: Omit<Card, 'set_id' | 'user_id'>[], folderId?: string | null) => Promise<void>
  deleteSet: (id: string) => Promise<void>
  togglePin: (id: string) => Promise<void>
  moveToFolder: (id: string, folderId: string | null) => Promise<void>
  importCards: (setId: string, cards: Omit<Card, 'id' | 'set_id' | 'user_id'>[]) => Promise<void>
  searchSets: (query: string) => Promise<void>
}

export const useSetsStore = create<SetsState>((set, get) => ({
  sets: [],
  currentSet: null,
  isLoading: false,
  error: null,
  setsLastFetched: 0,
  currentSetFetchedAt: 0,

  fetchSets: async () => {
    // Skip refetch if data is fresh (< 30s old) — avoids re-hitting Supabase on every navigation back to home
    if (get().sets.length > 0 && Date.now() - get().setsLastFetched < 30_000) return
    if (get().sets.length === 0) set({ isLoading: true })
    set({ error: null })
    const { data, error } = await supabase
      .from('sets')
      .select('*, cards(count)')
      .order('pinned', { ascending: false })
      .order('updated_at', { ascending: false })
    if (error) { set({ error: error.message, isLoading: false }); return }
    const sets = (data ?? []).map((s: any) => ({ ...s, cardCount: s.cards?.[0]?.count ?? 0 }))
    set({ sets, isLoading: false, setsLastFetched: Date.now() })
  },

  fetchSet: async (id) => {
    const { currentSet, currentSetFetchedAt, sets } = get()
    // Return cached data if same set fetched < 60s ago — covers Study ↔ Back ↔ Study
    if (currentSet?.id === id && currentSetFetchedAt > 0 && Date.now() - currentSetFetchedAt < 60_000) return
    // Show partial data from the sets list immediately so the page isn't blank while cards load
    if (currentSet?.id !== id) {
      const fromList = sets.find(s => s.id === id)
      if (fromList) set({ currentSet: { ...fromList, cards: [] }, isLoading: false })
      else set({ isLoading: true })
    }
    set({ error: null })
    const { data, error } = await supabase
      .from('sets').select('*, cards(*)').eq('id', id).single()
    if (error) { set({ error: error.message, isLoading: false }); return }
    const cards = (data.cards ?? []).sort((a: Card, b: Card) => a.position - b.position)
    set({ currentSet: { ...data, cards, cardCount: cards.length }, isLoading: false, currentSetFetchedAt: Date.now() })
  },

  createSet: async (title, description, rawCards, folderId = null) => {
    const user = useAuthStore.getState().user
    if (!user) throw new Error('Not authenticated')
    const safeTitle = sanitizeText(title, 200)
    const safeDesc = sanitizeText(description, 1000)
    const { data: setData, error: setError } = await supabase
      .from('sets')
      .insert({ title: safeTitle, description: safeDesc, user_id: user.id, folder_id: folderId, pinned: false })
      .select().single()
    if (setError) throw setError
    if (rawCards.length > 0) {
      const rows = rawCards.map((c, i) => {
        const safe = sanitizeCard(c)
        return { set_id: setData.id, user_id: user.id, term: safe.term, definition: safe.definition, position: i }
      })
      // Insert all chunks in parallel to avoid sequential latency on large sets
      const chunks: typeof rows[] = []
      for (let i = 0; i < rows.length; i += 15) chunks.push(rows.slice(i, i + 15))
      const results = await Promise.all(chunks.map(chunk => supabase.from('cards').insert(chunk)))
      const chunkErr = results.find(r => r.error)?.error
      if (chunkErr) throw chunkErr
    }
    const newSet = { ...setData, cardCount: rawCards.length }
    set((state) => ({ sets: [newSet, ...state.sets] }))
    return newSet
  },

  updateSet: async (id, title, description, rawCards, folderId = null) => {
    const user = useAuthStore.getState().user
    if (!user) throw new Error('Not authenticated')
    const safeTitle = sanitizeText(title, 200)
    const safeDesc = sanitizeText(description, 1000)
    const safeCards = rawCards.map((c, i) => ({ ...sanitizeCard(c), position: i }))
    // Optimistic: update UI immediately so navigation back feels instant
    set((state) => ({
      sets: state.sets.map((s) => s.id === id ? { ...s, title: safeTitle, description: safeDesc, folder_id: folderId, cardCount: safeCards.length } : s),
      currentSet: state.currentSet?.id === id
        ? { ...state.currentSet, title: safeTitle, description: safeDesc, folder_id: folderId, cardCount: safeCards.length,
            cards: safeCards.map((c) => ({ ...c, id: (c as any).id ?? '', set_id: id, user_id: user.id })) }
        : state.currentSet,
    }))
    // Sync to DB in background
    await supabase.from('sets').update({ title: safeTitle, description: safeDesc, folder_id: folderId }).eq('id', id)
    await supabase.from('cards').delete().eq('set_id', id)
    if (rawCards.length > 0) {
      const rows = safeCards.map((c) => ({ set_id: id, user_id: user.id, term: c.term, definition: c.definition, position: c.position }))
      try {
        const chunks: typeof rows[] = []
        for (let i = 0; i < rows.length; i += 15) chunks.push(rows.slice(i, i + 15))
        const results = await Promise.all(chunks.map(chunk => supabase.from('cards').insert(chunk)))
        const chunkErr = results.find(r => r.error)?.error
        if (chunkErr) throw chunkErr
      } catch (err) {
        // Re-fetch so UI reflects actual DB state (partial write may have occurred)
        await get().fetchSet(id)
        throw err
      }
    }
    // Invalidate cache then refresh to get server-assigned card IDs
    set({ currentSetFetchedAt: 0, setsLastFetched: 0 })
    get().fetchSet(id)
  },

  deleteSet: async (id) => {
    // Optimistic: remove from UI immediately, sync in background
    const prev = get().sets
    set((state) => ({ sets: state.sets.filter((s) => s.id !== id), currentSet: null }))
    const { error } = await supabase.from('sets').delete().eq('id', id)
    if (error) set({ sets: prev }) // rollback on failure
  },

  togglePin: async (id) => {
    const s = get().sets.find((x) => x.id === id)
    if (!s) return
    const pinned = !s.pinned
    // Optimistic: flip pin state immediately, sync in background
    set((state) => ({
      sets: state.sets.map((x) => x.id === id ? { ...x, pinned } : x),
      currentSet: state.currentSet?.id === id ? { ...state.currentSet, pinned } : state.currentSet,
    }))
    const { error } = await supabase.from('sets').update({ pinned }).eq('id', id)
    if (error) set((state) => ({ // rollback on failure
      sets: state.sets.map((x) => x.id === id ? { ...x, pinned: !pinned } : x),
      currentSet: state.currentSet?.id === id ? { ...state.currentSet, pinned: !pinned } : state.currentSet,
    }))
  },

  moveToFolder: async (id, folderId) => {
    // Optimistic: update folder immediately, sync in background
    const prev = { sets: get().sets, currentSet: get().currentSet }
    set((state) => ({
      sets: state.sets.map((s) => s.id === id ? { ...s, folder_id: folderId } : s),
      currentSet: state.currentSet?.id === id ? { ...state.currentSet, folder_id: folderId } : state.currentSet,
    }))
    const { error } = await supabase.from('sets').update({ folder_id: folderId }).eq('id', id)
    if (error) set(prev) // rollback on failure
  },

  importCards: async (setId, rawCards) => {
    const user = useAuthStore.getState().user
    if (!user) throw new Error('Not authenticated')
    const existing = get().currentSet?.cards ?? []
    await supabase.from('cards').insert(
      rawCards.map((c, i) => {
        const safe = sanitizeCard(c)
        return { set_id: setId, user_id: user.id, term: safe.term, definition: safe.definition, position: existing.length + i }
      })
    )
    set({ currentSetFetchedAt: 0 })
    await get().fetchSet(setId)
  },

  searchSets: async (query) => {
    set({ isLoading: true })
    const safeQuery = escapeIlike(query.trim())
    const { data, error } = await supabase
      .from('sets').select('*, cards(count)').ilike('title', `%${safeQuery}%`)
      .order('pinned', { ascending: false }).order('updated_at', { ascending: false })
    if (error) { set({ error: error.message, isLoading: false }); return }
    const sets = (data ?? []).map((s: any) => ({ ...s, cardCount: s.cards?.[0]?.count ?? 0 }))
    set({ sets, isLoading: false })
  },
}))
