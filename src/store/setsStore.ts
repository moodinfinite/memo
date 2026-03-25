import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { FlashcardSet, Card } from '@/lib/database.types'
import { sanitizeText, sanitizeCard, escapeIlike } from '@/lib/sanitize'

interface SetsState {
  sets: FlashcardSet[]
  currentSet: FlashcardSet | null
  isLoading: boolean
  error: string | null
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

  fetchSets: async () => {
    if (get().sets.length === 0) set({ isLoading: true })
    set({ error: null })
    const { data, error } = await supabase
      .from('sets')
      .select('*, cards(count)')
      .order('pinned', { ascending: false })
      .order('updated_at', { ascending: false })
    if (error) { set({ error: error.message, isLoading: false }); return }
    const sets = (data ?? []).map((s: any) => ({ ...s, cardCount: s.cards?.[0]?.count ?? 0 }))
    set({ sets, isLoading: false })
  },

  fetchSet: async (id) => {
    if (get().currentSet?.id !== id) set({ isLoading: true })
    set({ error: null })
    const { data, error } = await supabase
      .from('sets').select('*, cards(*)').eq('id', id).single()
    if (error) { set({ error: error.message, isLoading: false }); return }
    const cards = (data.cards ?? []).sort((a: Card, b: Card) => a.position - b.position)
    set({ currentSet: { ...data, cards, cardCount: cards.length }, isLoading: false })
  },

  createSet: async (title, description, rawCards, folderId = null) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')
    const safeTitle = sanitizeText(title, 200)
    const safeDesc = sanitizeText(description, 1000)
    const { data: setData, error: setError } = await supabase
      .from('sets')
      .insert({ title: safeTitle, description: safeDesc, user_id: user.id, folder_id: folderId, pinned: false })
      .select().single()
    if (setError) throw setError
    if (rawCards.length > 0) {
      await supabase.from('cards').insert(
        rawCards.map((c, i) => {
          const safe = sanitizeCard(c)
          return { set_id: setData.id, user_id: user.id, term: safe.term, definition: safe.definition, position: i }
        })
      )
    }
    const newSet = { ...setData, cardCount: rawCards.length }
    set((state) => ({ sets: [newSet, ...state.sets] }))
    return newSet
  },

  updateSet: async (id, title, description, rawCards, folderId = null) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')
    const safeTitle = sanitizeText(title, 200)
    const safeDesc = sanitizeText(description, 1000)
    await supabase.from('sets').update({ title: safeTitle, description: safeDesc, folder_id: folderId }).eq('id', id)
    await supabase.from('cards').delete().eq('set_id', id)
    if (rawCards.length > 0) {
      await supabase.from('cards').insert(
        rawCards.map((c, i) => {
          const safe = sanitizeCard(c)
          return { set_id: id, user_id: user.id, term: safe.term, definition: safe.definition, position: i }
        })
      )
    }
    await get().fetchSet(id)
  },

  deleteSet: async (id) => {
    await supabase.from('sets').delete().eq('id', id)
    set((state) => ({ sets: state.sets.filter((s) => s.id !== id), currentSet: null }))
  },

  togglePin: async (id) => {
    const s = get().sets.find((x) => x.id === id)
    if (!s) return
    const pinned = !s.pinned
    await supabase.from('sets').update({ pinned }).eq('id', id)
    set((state) => ({
      sets: state.sets.map((x) => x.id === id ? { ...x, pinned } : x),
      currentSet: state.currentSet?.id === id ? { ...state.currentSet, pinned } : state.currentSet,
    }))
  },

  moveToFolder: async (id, folderId) => {
    await supabase.from('sets').update({ folder_id: folderId }).eq('id', id)
    set((state) => ({
      sets: state.sets.map((s) => s.id === id ? { ...s, folder_id: folderId } : s),
      currentSet: state.currentSet?.id === id ? { ...state.currentSet, folder_id: folderId } : state.currentSet,
    }))
  },

  importCards: async (setId, rawCards) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')
    const existing = get().currentSet?.cards ?? []
    await supabase.from('cards').insert(
      rawCards.map((c, i) => {
        const safe = sanitizeCard(c)
        return { set_id: setId, user_id: user.id, term: safe.term, definition: safe.definition, position: existing.length + i }
      })
    )
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
