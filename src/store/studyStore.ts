import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { Card, StudyMode, SessionDraft } from '@/lib/database.types'
import { generateMCQuestions, type MCQuestion } from '@/lib/multipleChoice'
import { isFuzzyMatch } from '@/lib/fuzzy'
import { useSRSStore } from './srsStore'
import { useProgressStore } from './progressStore'

interface StudyState {
  mode: StudyMode; setId: string
  sessionCards: Card[]; mcQuestions: MCQuestion[]
  currentIndex: number; known: string[]; unknown: string[]; isComplete: boolean
  doShuffle: boolean; timerOn: boolean; timerDurMin: number; timerSecsLeft: number
  typedAnswer: string; typedResult: 'idle' | 'correct' | 'incorrect'
  selectedOption: number | null; mcResult: 'idle' | 'correct' | 'incorrect'; mcStreak: number
  persistError: string | null
  hasDraft: boolean; draftLoading: boolean
  startSession: (cards: Card[], mode: StudyMode, setId: string, opts?: { shuffle?: boolean; timerDurMin?: number }) => void
  resumeSession: (draft: SessionDraft, cards: Card[]) => void
  saveProgress: () => Promise<void>
  loadProgress: (setId: string) => Promise<SessionDraft | null>
  clearProgress: (setId: string) => Promise<void>
  markKnown: () => void; markUnknown: () => void
  submitTyped: () => void; setTypedAnswer: (val: string) => void
  selectMCOption: (idx: number) => void
  reshuffleRemaining: () => void
  tickTimer: () => void; resetSession: () => void
  persistSession: () => Promise<void>
  _persist: (known: string[], unknown: string[], total: number, mode: StudyMode, setId: string) => Promise<void>
}

function shuffleArr<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]] }
  return a
}

export const useStudyStore = create<StudyState>((set, get) => ({
  mode: 'flashcard', setId: '', sessionCards: [], mcQuestions: [],
  currentIndex: 0, known: [], unknown: [], isComplete: false,
  doShuffle: false, timerOn: false, timerDurMin: 5, timerSecsLeft: 0,
  typedAnswer: '', typedResult: 'idle', selectedOption: null, mcResult: 'idle', mcStreak: 0,
  persistError: null,
  hasDraft: false, draftLoading: false,

  startSession: (cards, mode, setId, opts = {}) => {
    const { shuffle = false, timerDurMin = 0 } = opts
    const srs = useSRSStore.getState()
    const dueIds = new Set(srs.getDueCards(setId, cards))
    let ordered = [...cards.filter(c => dueIds.has(c.id)), ...cards.filter(c => !dueIds.has(c.id))]
    if (shuffle) ordered = shuffleArr(ordered)
    set({
      mode, setId, sessionCards: ordered,
      mcQuestions: mode === 'multiple_choice' ? generateMCQuestions(ordered) : [],
      currentIndex: 0, known: [], unknown: [], isComplete: false,
      doShuffle: shuffle, timerOn: timerDurMin > 0,
      timerDurMin, timerSecsLeft: timerDurMin * 60,
      typedAnswer: '', typedResult: 'idle', selectedOption: null, mcResult: 'idle', mcStreak: 0,
    })
  },

  markKnown: () => {
    const { sessionCards, currentIndex, known, mode, setId } = get()
    const card = sessionCards[currentIndex]
    if (!card) return
    const newKnown = [...known, card.id]
    const nextIndex = currentIndex + 1
    const isComplete = nextIndex >= sessionCards.length
    useSRSStore.getState().updateSRS(card.id, setId, true)
    set({ known: newKnown, currentIndex: nextIndex, isComplete })
    if (isComplete) { get()._persist(newKnown, get().unknown, sessionCards.length, mode, setId) }
    else { get().saveProgress() }
  },

  markUnknown: () => {
    const { sessionCards, currentIndex, unknown, mode, setId } = get()
    const card = sessionCards[currentIndex]
    if (!card) return
    const newUnknown = [...unknown, card.id]
    const nextIndex = currentIndex + 1
    const isComplete = nextIndex >= sessionCards.length
    useSRSStore.getState().updateSRS(card.id, setId, false)
    set({ unknown: newUnknown, currentIndex: nextIndex, isComplete })
    if (isComplete) { get()._persist(get().known, newUnknown, sessionCards.length, mode, setId) }
    else { get().saveProgress() }
  },

  submitTyped: () => {
    const { sessionCards, currentIndex, typedAnswer } = get()
    const correct = isFuzzyMatch(typedAnswer, sessionCards[currentIndex].definition)
    set({ typedResult: correct ? 'correct' : 'incorrect' })
    setTimeout(() => { if (correct) get().markKnown(); else get().markUnknown(); set({ typedAnswer: '', typedResult: 'idle' }) }, 1200)
  },

  setTypedAnswer: (val) => set({ typedAnswer: val }),

  selectMCOption: (idx) => {
    const { mcQuestions, currentIndex, mcStreak } = get()
    const q = mcQuestions[currentIndex]
    if (!q || get().mcResult !== 'idle') return
    const correct = idx === q.correctIndex
    const newStreak = correct ? mcStreak + 1 : 0
    set({ selectedOption: idx, mcResult: correct ? 'correct' : 'incorrect', mcStreak: newStreak })
    setTimeout(() => { if (correct) get().markKnown(); else get().markUnknown(); set({ selectedOption: null, mcResult: 'idle' }) }, 1000)
  },

  tickTimer: () => {
    const { timerSecsLeft, isComplete } = get()
    if (isComplete || timerSecsLeft <= 0) return
    const next = timerSecsLeft - 1
    set({ timerSecsLeft: next })
    if (next <= 0) {
      const { sessionCards, currentIndex, known, unknown, mode, setId } = get()
      const remaining = sessionCards.slice(currentIndex).map(c => c.id)
      const finalUnknown = [...unknown, ...remaining]
      set({ isComplete: true, unknown: finalUnknown })
      get()._persist(known, finalUnknown, sessionCards.length, mode, setId)
    }
  },

  reshuffleRemaining: () => {
    const { sessionCards, currentIndex, mode } = get()
    const done = sessionCards.slice(0, currentIndex)
    const remaining = shuffleArr(sessionCards.slice(currentIndex))
    const newCards = [...done, ...remaining]
    set({
      sessionCards: newCards,
      mcQuestions: mode === 'multiple_choice' ? generateMCQuestions(newCards) : [],
    })
  },

  resetSession: () => set({ sessionCards: [], currentIndex: 0, known: [], unknown: [], isComplete: false, typedAnswer: '', typedResult: 'idle', selectedOption: null, mcResult: 'idle', mcStreak: 0, timerSecsLeft: 0, persistError: null }),

  persistSession: async () => {
    const { known, unknown, sessionCards, mode, setId } = get()
    if (known.length === 0 && unknown.length === 0) return
    await get()._persist(known, unknown, sessionCards.length, mode, setId)
  },

  resumeSession: (draft, cards) => {
    const cardMap = Object.fromEntries(cards.map(c => [c.id, c]))
    const orderedCards = draft.card_order.map(cid => cardMap[cid]).filter(Boolean) as Card[]
    if (orderedCards.length === 0) return
    const safeIndex = Math.min(draft.current_index, orderedCards.length - 1)
    set({
      mode: draft.mode, setId: draft.set_id, sessionCards: orderedCards,
      mcQuestions: draft.mode === 'multiple_choice' ? generateMCQuestions(orderedCards) : [],
      currentIndex: safeIndex, known: draft.known_ids, unknown: draft.unknown_ids,
      isComplete: false, doShuffle: draft.do_shuffle,
      timerOn: draft.timer_dur_min > 0, timerDurMin: draft.timer_dur_min,
      timerSecsLeft: draft.timer_dur_min * 60,
      typedAnswer: '', typedResult: 'idle', selectedOption: null, mcResult: 'idle', mcStreak: 0,
      persistError: null,
    })
  },

  saveProgress: async () => {
    const { sessionCards, currentIndex, known, unknown, mode, setId, doShuffle, timerDurMin } = get()
    if (!setId || setId === '__master__' || sessionCards.length === 0) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('session_drafts').upsert({
      user_id: user.id, set_id: setId, mode,
      card_order: sessionCards.map(c => c.id),
      current_index: currentIndex,
      known_ids: known, unknown_ids: unknown,
      do_shuffle: doShuffle, timer_dur_min: timerDurMin,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,set_id' })
  },

  loadProgress: async (setId) => {
    set({ draftLoading: true, hasDraft: false })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { set({ draftLoading: false }); return null }
    const { data } = await supabase.from('session_drafts').select('*')
      .eq('user_id', user.id).eq('set_id', setId).maybeSingle()
    if (data && Date.now() - new Date(data.updated_at).getTime() > 7 * 24 * 60 * 60 * 1000) {
      await get().clearProgress(setId)
      set({ draftLoading: false, hasDraft: false })
      return null
    }
    set({ draftLoading: false, hasDraft: !!data })
    return (data as SessionDraft) ?? null
  },

  clearProgress: async (setId) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('session_drafts').delete()
      .eq('user_id', user.id).eq('set_id', setId)
    set({ hasDraft: false })
  },

  _persist: async (known: string[], unknown: string[], total: number, mode: StudyMode, setId: string) => {
    set({ persistError: null })
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !setId || setId === '__master__') return
      const { error } = await supabase.from('study_sessions').insert({
        user_id: user.id, set_id: setId, mode, total_cards: total,
        known_count: known.length, unknown_count: unknown.length,
        score_pct: total > 0 ? Math.round((known.length / total) * 100) : 0,
        completed_at: new Date().toISOString(),
      })
      if (error) {
        console.error('study_sessions insert failed:', error.message)
        set({ persistError: 'Failed to save session. Your progress may not be recorded.' })
        return
      }
      await get().clearProgress(setId)
      await useProgressStore.getState().fetchProgress()
    } catch (err) {
      console.error('study_sessions persist error:', err)
      set({ persistError: 'Failed to save session. Check your connection.' })
    }
  },
}))
