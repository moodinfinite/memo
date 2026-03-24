import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { Card, StudyMode } from '@/lib/database.types'
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
  startSession: (cards: Card[], mode: StudyMode, setId: string, opts?: { shuffle?: boolean; timerDurMin?: number }) => void
  markKnown: () => void; markUnknown: () => void
  submitTyped: () => void; setTypedAnswer: (val: string) => void
  selectMCOption: (idx: number) => void
  reshuffleRemaining: () => void
  tickTimer: () => void; resetSession: () => void
  persistSession: () => Promise<void>
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
    const { sessionCards, currentIndex, known } = get()
    const card = sessionCards[currentIndex]
    const newKnown = [...known, card.id]
    const nextIndex = currentIndex + 1
    const isComplete = nextIndex >= sessionCards.length
    useSRSStore.getState().updateSRS(card.id, get().setId, true)
    set({ known: newKnown, currentIndex: nextIndex, isComplete })
    if (isComplete) { (get() as any)._persist(newKnown, get().unknown, sessionCards.length, get().mode, get().setId) }
  },

  markUnknown: () => {
    const { sessionCards, currentIndex, unknown } = get()
    const card = sessionCards[currentIndex]
    const newUnknown = [...unknown, card.id]
    const nextIndex = currentIndex + 1
    const isComplete = nextIndex >= sessionCards.length
    useSRSStore.getState().updateSRS(card.id, get().setId, false)
    set({ unknown: newUnknown, currentIndex: nextIndex, isComplete })
    if (isComplete) { (get() as any)._persist(get().known, newUnknown, sessionCards.length, get().mode, get().setId) }
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
      const { sessionCards, currentIndex, known, unknown } = get()
      const remaining = sessionCards.slice(currentIndex).map(c => c.id)
      const finalUnknown = [...unknown, ...remaining]
      set({ isComplete: true, unknown: finalUnknown })
      ;(get() as any)._persist(known, finalUnknown)
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

  resetSession: () => set({ sessionCards: [], currentIndex: 0, known: [], unknown: [], isComplete: false, typedAnswer: '', typedResult: 'idle', selectedOption: null, mcResult: 'idle', mcStreak: 0, timerSecsLeft: 0 }),

  persistSession: async () => {
    const { known, unknown, sessionCards, mode, setId } = get()
    if (known.length === 0 && unknown.length === 0) return
    await (get() as any)._persist(known, unknown, sessionCards.length, mode, setId)
  },

  _persist: async (known: string[], unknown: string[], total: number, mode: StudyMode, setId: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !setId || setId === '__master__') return
    await supabase.from('study_sessions').insert({
      user_id: user.id, set_id: setId, mode, total_cards: total,
      known_count: known.length, unknown_count: unknown.length,
      score_pct: total > 0 ? Math.round((known.length / total) * 100) : 0,
    })
    useProgressStore.getState().fetchProgress()
  },
} as StudyState & { _persist: (known: string[], unknown: string[]) => Promise<void> }))
