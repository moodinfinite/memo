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
  pendingSaves: string[]         // set IDs currently syncing to DB
  saveErrors: Record<string, string> // set ID -> error message for failed syncs
  fetchSets: () => Promise<void>
  fetchSet: (id: string) => Promise<void>
  createSet: (title: string, description: string, cards: Omit<Card, 'id' | 'set_id' | 'user_id'>[], folderId?: string | null) => FlashcardSet
  retrySave: (id: string) => Promise<void>
  updateSet: (id: string, title: string, description: string, cards: Omit<Card, 'set_id' | 'user_id'>[], folderId?: string | null) => Promise<void>
  deleteSet: (id: string) => Promise<void>
  togglePin: (id: string) => Promise<void>
  moveToFolder: (id: string, folderId: string | null) => Promise<void>
  importCards: (setId: string, cards: Omit<Card, 'id' | 'set_id' | 'user_id'>[]) => Promise<void>
  searchSets: (query: string) => Promise<void>
  saveToSavedWords: (term: string, definition: string) => Promise<void>
}

// Serializes concurrent "find or create Saved Words set" calls so only one DB insert fires
let savedWordsReady: Promise<string> | null = null

export const useSetsStore = create<SetsState>((set, get) => ({
  sets: [],
  currentSet: null,
  isLoading: false,
  error: null,
  setsLastFetched: 0,
  currentSetFetchedAt: 0,
  pendingSaves: [],
  saveErrors: {},

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
    const { currentSet, currentSetFetchedAt, sets, pendingSaves } = get()
    // Don't fetch from DB while we're still syncing this set — use optimistic data
    if (pendingSaves.includes(id)) return
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

  createSet: (title, description, rawCards, folderId = null) => {
    const user = useAuthStore.getState().user
    if (!user) throw new Error('Not authenticated')
    const id = crypto.randomUUID()
    const safeTitle = sanitizeText(title, 200)
    const safeDesc = sanitizeText(description, 1000)
    const safeCards = rawCards.map((c, i) => {
      const safe = sanitizeCard(c)
      return { id: crypto.randomUUID(), set_id: id, user_id: user.id, term: safe.term, definition: safe.definition, position: i }
    })
    const optimisticSet: FlashcardSet = {
      id, title: safeTitle, description: safeDesc, user_id: user.id,
      folder_id: folderId ?? null, pinned: false, cardCount: safeCards.length,
      cards: safeCards, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }
    // Add to store immediately — user navigates right away
    set(state => ({ sets: [optimisticSet, ...state.sets], currentSet: optimisticSet, pendingSaves: [...state.pendingSaves, id] }))

    // Background sync — no await
    ;(async () => {
      try {
        const { error: setError } = await supabase
          .from('sets').insert({ id, title: safeTitle, description: safeDesc, user_id: user.id, folder_id: folderId, pinned: false })
        if (setError) throw setError
        if (safeCards.length > 0) {
          const rows = safeCards.map(c => ({ set_id: id, user_id: user.id, term: c.term, definition: c.definition, position: c.position }))
          const chunks: typeof rows[] = []
          for (let i = 0; i < rows.length; i += 15) chunks.push(rows.slice(i, i + 15))
          const results = await Promise.all(chunks.map(chunk => supabase.from('cards').insert(chunk)))
          const chunkErr = results.find(r => r.error)?.error
          if (chunkErr) throw chunkErr
        }
        // Success — remove from pending, refresh to get server-assigned timestamps
        set(state => ({ pendingSaves: state.pendingSaves.filter(x => x !== id) }))
        get().fetchSet(id)
      } catch (err: any) {
        set(state => ({ pendingSaves: state.pendingSaves.filter(x => x !== id), saveErrors: { ...state.saveErrors, [id]: err?.message ?? 'Save failed' } }))
      }
    })()

    return optimisticSet
  },

  retrySave: async (id) => {
    const s = get().sets.find(x => x.id === id)
    if (!s) return
    const user = useAuthStore.getState().user
    if (!user) return
    set(state => ({ pendingSaves: [...state.pendingSaves, id], saveErrors: Object.fromEntries(Object.entries(state.saveErrors).filter(([k]) => k !== id)) }))
    try {
      await supabase.from('sets').upsert({ id, title: s.title, description: s.description, user_id: user.id, folder_id: s.folder_id, pinned: s.pinned })
      if ((s.cards ?? []).length > 0) {
        await supabase.from('cards').delete().eq('set_id', id)
        const rows = (s.cards ?? []).map(c => ({ set_id: id, user_id: user.id, term: c.term, definition: c.definition, position: c.position }))
        const chunks: typeof rows[] = []
        for (let i = 0; i < rows.length; i += 15) chunks.push(rows.slice(i, i + 15))
        const results = await Promise.all(chunks.map(chunk => supabase.from('cards').insert(chunk)))
        const chunkErr = results.find(r => r.error)?.error
        if (chunkErr) throw chunkErr
      }
      set(state => ({ pendingSaves: state.pendingSaves.filter(x => x !== id) }))
      get().fetchSet(id)
    } catch (err: any) {
      set(state => ({ pendingSaves: state.pendingSaves.filter(x => x !== id), saveErrors: { ...state.saveErrors, [id]: err?.message ?? 'Save failed' } }))
    }
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
            cards: safeCards.filter((c) => (c as any).id).map((c) => ({ ...(c as any), set_id: id, user_id: user.id })) }
        : state.currentSet,
    }))
    // Sync to DB — throw on error so the caller can surface it to the user
    const { error: updateErr } = await supabase.from('sets').update({ title: safeTitle, description: safeDesc, folder_id: folderId }).eq('id', id)
    if (updateErr) throw updateErr
    const { error: deleteErr } = await supabase.from('cards').delete().eq('set_id', id)
    if (deleteErr) throw deleteErr
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
    const deleted = get().sets.find((s) => s.id === id)
    set((state) => ({ sets: state.sets.filter((s) => s.id !== id), currentSet: null }))
    const { error } = await supabase.from('sets').delete().eq('id', id)
    if (error && deleted) set((state) => ({ sets: [...state.sets, deleted] })) // rollback only the removed item
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

  saveToSavedWords: async (term, definition) => {
    const user = useAuthStore.getState().user
    if (!user) throw new Error('Not authenticated')
    const safeTerm = sanitizeText(term, 200)
    const safeDef = sanitizeText(definition, 500)

    // Serialize concurrent calls — only one "find or create" runs at a time
    if (!savedWordsReady) {
      savedWordsReady = (async () => {
        let savedSet = get().sets.find(s => s.title === 'Saved Words')
        if (!savedSet) {
          const { data: existing } = await supabase
            .from('sets').select('*').eq('user_id', user.id).eq('title', 'Saved Words').maybeSingle()
          if (existing) {
            savedSet = { ...existing, cardCount: existing.cardCount ?? 0, cards: [] }
            set(state => ({ sets: state.sets.some(s => s.id === existing.id) ? state.sets : [savedSet!, ...state.sets] }))
          } else {
            const { data: newSet, error } = await supabase
              .from('sets').insert({ title: 'Saved Words', description: 'Words saved while reading stories', user_id: user.id, folder_id: null, pinned: false })
              .select().single()
            if (error) throw error
            savedSet = { ...newSet, cardCount: 0, cards: [] }
            set(state => ({ sets: [savedSet!, ...state.sets] }))
          }
        }
        return savedSet.id
      })().finally(() => { savedWordsReady = null })
    }
    const savedSetId = await savedWordsReady

    // Get current card count for position
    const { count } = await supabase.from('cards').select('*', { count: 'exact', head: true }).eq('set_id', savedSetId)
    const { error: cardErr } = await supabase.from('cards').insert({
      set_id: savedSetId, user_id: user.id,
      term: safeTerm, definition: safeDef, position: count ?? 0,
    })
    if (cardErr) throw cardErr

    // Update local card count
    set(state => ({ sets: state.sets.map(s => s.id === savedSetId ? { ...s, cardCount: (s.cardCount ?? 0) + 1 } : s) }))
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
