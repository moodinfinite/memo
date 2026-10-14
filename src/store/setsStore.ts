import { discardPending } from '@/lib/sync'
import { useSRSStore } from './srsStore'
import { registerAccountReset } from '@/lib/accountState'
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
  updateCard: (card: Card, term: string, definition: string) => Promise<Card>
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
    const userId = useAuthStore.getState().user?.id
    if (!userId) return
    // Skip refetch if data is fresh (< 30s old) — avoids re-hitting Supabase on every navigation back to home
    if (get().sets.length > 0 && Date.now() - get().setsLastFetched < 30_000) return
    if (get().sets.length === 0) set({ isLoading: true })
    set({ error: null })
    const { data, error } = await supabase
      .from('sets')
      .select('*, cards(count)')
      .order('pinned', { ascending: false })
      .order('updated_at', { ascending: false })
    if (useAuthStore.getState().user?.id !== userId) return
    if (error) { set({ error: error.message, isLoading: false }); return }
    const sets = (data ?? []).map((s: any) => ({ ...s, cardCount: s.cards?.[0]?.count ?? 0 }))
    const local = get().sets.filter(s => get().pendingSaves.includes(s.id) || get().saveErrors[s.id])
    set({ sets: [...local, ...sets.filter(s => !local.some(l => l.id === s.id))], isLoading: false, setsLastFetched: Date.now() })
  },

  fetchSet: async (id) => {
    const userId = useAuthStore.getState().user?.id
    if (!userId) return
    const { currentSet, currentSetFetchedAt, sets, pendingSaves } = get()
    // Don't fetch from DB while we're still syncing this set — use optimistic data
    if (pendingSaves.includes(id) || get().saveErrors[id]) return
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
    if (useAuthStore.getState().user?.id !== userId) return
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
        const { error } = await supabase.rpc('save_deck', {
          p_id: id, p_title: safeTitle, p_description: safeDesc, p_folder_id: folderId,
          p_cards: safeCards, p_create: true,
        })
        if (error) throw error
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
      const { error } = await supabase.rpc('save_deck', {
        p_id: id, p_title: s.title, p_description: s.description, p_folder_id: s.folder_id ?? null,
        p_cards: s.cards ?? [], p_create: true,
      })
      if (error) throw error
      set(state => ({ pendingSaves: state.pendingSaves.filter(x => x !== id) }))
      get().fetchSet(id)
    } catch (err: any) {
      set(state => ({ pendingSaves: state.pendingSaves.filter(x => x !== id), saveErrors: { ...state.saveErrors, [id]: err?.message ?? 'Save failed' } }))
    }
  },

  updateSet: async (id, title, description, rawCards, folderId) => {
    const user = useAuthStore.getState().user
    if (!user) throw new Error('Not authenticated')
    const previous = get().currentSet?.id === id ? get().currentSet : get().sets.find(s => s.id === id)
    const safeTitle = sanitizeText(title, 200)
    const safeDesc = sanitizeText(description, 1000)
    const safeFolder = folderId === undefined ? previous?.folder_id ?? null : folderId
    const cards = rawCards.map((c, position) => ({
      ...sanitizeCard(c), id: c.id || crypto.randomUUID(), position, set_id: id, user_id: user.id,
    }))
    // No optimistic destructive replacement: the database commits the whole edit or none of it.
    const { error } = await supabase.rpc('save_deck', {
      p_id: id, p_title: safeTitle, p_description: safeDesc, p_folder_id: safeFolder,
      p_cards: cards, p_create: false,
    })
    if (error) throw new Error(`Deck was not saved. ${error.message}`)
    if (useAuthStore.getState().user?.id !== user.id) return
    const removed = (previous?.cards ?? []).filter(c => !cards.some(next => next.id === c.id)).map(c => c.id)
    for (const cardId of removed) discardPending(user.id, `srs:${cardId}`)
    useSRSStore.setState(state => ({ cardSRS: Object.fromEntries(Object.entries(state.cardSRS).filter(([id]) => !removed.includes(id))), srsAllFetchedAt: 0 }))
    const changes = { title: safeTitle, description: safeDesc, folder_id: safeFolder, cards, cardCount: cards.length }
    set(state => ({
      sets: state.sets.map(s => s.id === id ? { ...s, ...changes } : s),
      currentSet: state.currentSet?.id === id ? { ...state.currentSet, ...changes } : state.currentSet,
      currentSetFetchedAt: 0, setsLastFetched: 0,
    }))
    await get().fetchSet(id)
  },

  updateCard: async (card, term, definition) => {
    const userId = useAuthStore.getState().user?.id
    if (!userId || card.user_id !== userId) throw new Error('Please sign in again before editing.')
    const content = sanitizeCard({ term, definition })
    if (!content.term || !content.definition) throw new Error('Enter both a term and definition.')
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    try {
      // Update only this card's text; never replace the deck or its mastery records.
      const { data, error } = await supabase.from('cards').update(content)
        .eq('id', card.id).eq('set_id', card.set_id).eq('user_id', userId)
        .select('*').abortSignal(controller.signal).single()
      if (error || !data) throw new Error('Card was not saved. Check your connection and retry.')
      if (useAuthStore.getState().user?.id !== userId) throw new Error('Account changed. Please reopen the card.')
      const updated = data as Card
      const patch = (cards?: Card[]) => cards?.map(c => c.id === updated.id ? updated : c)
      set(state => ({
        currentSet: state.currentSet ? { ...state.currentSet, cards: patch(state.currentSet.cards) } : null,
        sets: state.sets.map(s => ({ ...s, cards: patch(s.cards) })),
        currentSetFetchedAt: 0, setsLastFetched: 0,
      }))
      return updated
    } finally { clearTimeout(timeout) }
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
    const { error } = await supabase.from('cards').insert(
      rawCards.map((c, i) => {
        const safe = sanitizeCard(c)
        return { set_id: setId, user_id: user.id, term: safe.term, definition: safe.definition, position: existing.length + i }
      })
    )
    if (error) throw error
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
    const userId = useAuthStore.getState().user?.id
    if (!userId) return
    set({ isLoading: true })
    const safeQuery = escapeIlike(query.trim())
    const { data, error } = await supabase
      .from('sets').select('*, cards(count)').ilike('title', `%${safeQuery}%`)
      .order('pinned', { ascending: false }).order('updated_at', { ascending: false })
    if (useAuthStore.getState().user?.id !== userId) return
    if (error) { set({ error: error.message, isLoading: false }); return }
    const sets = (data ?? []).map((s: any) => ({ ...s, cardCount: s.cards?.[0]?.count ?? 0 }))
    set({ sets, isLoading: false })
  },
}))

registerAccountReset(() => useSetsStore.setState(useSetsStore.getInitialState(), true))
