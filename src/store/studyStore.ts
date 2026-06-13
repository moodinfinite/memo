import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { Card, StudyMode, SessionDraft, SentenceEntry } from '@/lib/database.types'
import { generateMCQuestions, type MCQuestion } from '@/lib/multipleChoice'
import { isFuzzyMatch } from '@/lib/fuzzy'
import { useSRSStore } from './srsStore'
import { useProgressStore } from './progressStore'
import { useAuthStore } from './authStore'

interface StudyState {
  // ── Learn mode ──────────────────────────────────────────────
  learnActive: boolean
  learnCards: Card[]
  learnBatch: Card[]
  learnQueue: Card[]
  learnGraduated: string[]
  learnScores: Record<string, number>   // session correct-streak per card
  learnBatchIdx: number
  learnComplete: boolean
  learnSetId: string
  learnBatchComplete: boolean
  learnBatchSummary: Card[]             // cards that graduated in the just-finished batch
  learnStoryReady: boolean              // batch fully graduated — show story before advancing
  startLearnSession: (cards: Card[], setId: string) => void
  answerLearnCard: (correct: boolean) => void
  advanceToNextBatch: () => void
  completeLearnStory: () => void
  resetLearn: () => void
  // ────────────────────────────────────────────────────────────
  mode: StudyMode; setId: string
  sessionCards: Card[]; mcQuestions: MCQuestion[]
  currentIndex: number; known: string[]; unknown: string[]; isComplete: boolean
  doShuffle: boolean; timerOn: boolean; timerDurMin: number; timerSecsLeft: number
  typedAnswer: string; typedResult: 'idle' | 'correct' | 'incorrect'
  selectedOption: number | null; mcResult: 'idle' | 'correct' | 'incorrect'; mcStreak: number; flashStreak: number
  isAdvancing: boolean
  lastAction: { prevKnown: string[]; prevUnknown: string[]; prevIndex: number; prevFlashStreak: number; cardId: string; prevCardSRS: import('./srsStore').CardSRS | null } | null
  persistError: string | null
  persistAttempt: number
  hasDraft: boolean; draftLoading: boolean
  isPersisting: boolean; persistSaved: boolean
  sentenceInput: string
  sentenceStatus: 'idle' | 'submitting' | 'reviewed'
  sentenceFeedback: string; sentenceImproved: string | null
  sentenceScore: 'great' | 'good' | 'needs_work' | null
  sentenceEntries: SentenceEntry[]
  setSentenceInput: (val: string) => void
  submitSentence: () => Promise<void>
  nextSentenceCard: () => void
  startSession: (cards: Card[], mode: StudyMode, setId: string, opts?: { shuffle?: boolean; timerDurMin?: number }) => void
  resumeSession: (draft: SessionDraft, cards: Card[]) => void
  saveProgress: () => void
  loadProgress: (setId: string) => Promise<SessionDraft | null>
  clearProgress: (setId: string) => Promise<void>
  markKnown: () => void; markUnknown: () => void; undoLast: () => void
  submitTyped: () => void; setTypedAnswer: (val: string) => void
  selectMCOption: (idx: number) => void
  reshuffleRemaining: () => void
  tickTimer: () => void; resetSession: () => void
  persistSession: () => Promise<void>
  retryPersist: () => Promise<void>
  dismissPersistError: () => void
  _persist: (known: string[], unknown: string[], total: number, mode: StudyMode, setId: string, clearDraft?: boolean) => Promise<void>
}

function shuffleArr<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]] }
  return a
}

// Module-level debounce timer for saveProgress — prevents firing 1 upsert per card
let _saveDebounceTimer: ReturnType<typeof setTimeout> | null = null
// Active abort controller — cancelled before each new _persist call so stale requests don't race
let _persistController: AbortController | null = null

export const useStudyStore = create<StudyState>((set, get) => ({
  // ── Learn mode initial state ─────────────────────────────────
  learnActive: false, learnCards: [], learnBatch: [], learnQueue: [],
  learnGraduated: [], learnScores: {}, learnBatchIdx: 0, learnComplete: false, learnSetId: '',
  learnBatchComplete: false, learnBatchSummary: [],
  learnStoryReady: false,

  startLearnSession: (cards, setId) => {
    const BATCH = 5
    const shuffled = shuffleArr([...cards])
    set({
      learnActive: true, learnCards: cards,
      learnBatch: shuffled.slice(0, BATCH), learnQueue: shuffled.slice(BATCH),
      learnGraduated: [], learnScores: {}, learnBatchIdx: 0,
      learnComplete: false, learnSetId: setId,
      learnBatchComplete: false, learnBatchSummary: [],
      learnStoryReady: false,
    })
  },

  answerLearnCard: (correct) => {
    const { learnBatch, learnQueue, learnGraduated, learnScores, learnBatchIdx, learnSetId, learnBatchSummary, learnCards } = get()
    const card = learnBatch[learnBatchIdx]
    if (!card) return
    useSRSStore.getState().updateSRS(card.id, learnSetId, correct)  // update long-term mastery
    const newScores = { ...learnScores, [card.id]: correct ? (learnScores[card.id] ?? 0) + 1 : 0 }
    const didGraduate = (newScores[card.id] ?? 0) >= 2
    let newBatch = [...learnBatch]
    const newGraduated = [...learnGraduated]
    let newBatchSummary = [...learnBatchSummary]
    let nextIdx: number
    if (didGraduate) {
      // Graduate: shrink batch (no queue refill until batch is done)
      newGraduated.push(card.id)
      newBatchSummary.push(card)
      newBatch = newBatch.filter((_, i) => i !== learnBatchIdx)
      nextIdx = newBatch.length === 0 ? 0 : learnBatchIdx % newBatch.length
    } else {
      nextIdx = (learnBatchIdx + 1) % newBatch.length
    }
    if (newBatch.length === 0) {
      // All batch cards graduated — show story interlude before advancing/completing
      set({ learnBatch: [], learnGraduated: newGraduated, learnScores: newScores, learnBatchSummary: newBatchSummary, learnStoryReady: true })
      return
    }
    set({ learnBatch: newBatch, learnGraduated: newGraduated, learnScores: newScores, learnBatchSummary: newBatchSummary, learnBatchIdx: nextIdx })
  },

  advanceToNextBatch: () => {
    const { learnQueue } = get()
    const BATCH = 5
    const nextBatch = learnQueue.slice(0, BATCH)
    const nextQueue = learnQueue.slice(BATCH)
    set({
      learnBatch: nextBatch, learnQueue: nextQueue,
      learnBatchComplete: false, learnBatchSummary: [],
      learnBatchIdx: 0, learnScores: {},
      learnStoryReady: false,
    })
  },

  // Called when user finishes the post-batch story interlude
  completeLearnStory: () => {
    const { learnQueue, learnGraduated, learnCards, learnSetId, learnBatchSummary } = get()
    if (learnQueue.length > 0) {
      // More batches remaining — show batch summary screen then advance
      set({ learnStoryReady: false, learnBatchComplete: true })
    } else {
      // All done — show learn complete
      set({ learnStoryReady: false, learnBatchComplete: false, learnComplete: true })
      get()._persist(learnGraduated, [], learnCards.length, 'learn', learnSetId, false)
    }
  },

  resetLearn: () => set({
    learnActive: false, learnCards: [], learnBatch: [], learnQueue: [],
    learnGraduated: [], learnScores: {}, learnBatchIdx: 0, learnComplete: false, learnSetId: '',
    learnBatchComplete: false, learnBatchSummary: [], learnStoryReady: false,
  }),
  // ─────────────────────────────────────────────────────────────
  mode: 'flashcard', setId: '', sessionCards: [], mcQuestions: [],
  currentIndex: 0, known: [], unknown: [], isComplete: false,
  doShuffle: false, timerOn: false, timerDurMin: 5, timerSecsLeft: 0,
  typedAnswer: '', typedResult: 'idle', selectedOption: null, mcResult: 'idle', mcStreak: 0, flashStreak: 0,
  isAdvancing: false, lastAction: null,
  persistError: null, persistAttempt: 0,
  hasDraft: false, draftLoading: false, isPersisting: false, persistSaved: false,
  sentenceInput: '', sentenceStatus: 'idle', sentenceFeedback: '', sentenceImproved: null,
  sentenceScore: null, sentenceEntries: [],

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
      typedAnswer: '', typedResult: 'idle', selectedOption: null, mcResult: 'idle', mcStreak: 0, flashStreak: 0,
      isAdvancing: false, lastAction: null,
    })
  },

  markKnown: () => {
    const { sessionCards, currentIndex, known, unknown, mode, setId, flashStreak, isAdvancing } = get()
    if (isAdvancing) return   // block rapid advances from keyboard or double-tap
    const card = sessionCards[currentIndex]
    if (!card) return
    set({ isAdvancing: true })
    setTimeout(() => set({ isAdvancing: false }), 400)
    const prevCardSRS = useSRSStore.getState().cardSRS[card.id] ?? null
    const snapshot = { prevKnown: known, prevUnknown: unknown, prevIndex: currentIndex, prevFlashStreak: flashStreak, cardId: card.id, prevCardSRS }
    const newKnown = [...known, card.id]
    const nextIndex = currentIndex + 1
    const isComplete = nextIndex >= sessionCards.length
    useSRSStore.getState().updateSRS(card.id, setId, true)
    set({ known: newKnown, currentIndex: nextIndex, isComplete, flashStreak: mode === 'flashcard' ? flashStreak + 1 : flashStreak, lastAction: snapshot })
    if (isComplete) { get()._persist(newKnown, get().unknown, sessionCards.length, mode, setId, true) }
    else { get().saveProgress() }
  },

  markUnknown: () => {
    const { sessionCards, currentIndex, known, unknown, mode, setId, flashStreak, isAdvancing } = get()
    if (isAdvancing) return   // block rapid advances from keyboard or double-tap
    const card = sessionCards[currentIndex]
    if (!card) return
    set({ isAdvancing: true })
    setTimeout(() => set({ isAdvancing: false }), 400)
    const prevCardSRS = useSRSStore.getState().cardSRS[card.id] ?? null
    const snapshot = { prevKnown: known, prevUnknown: unknown, prevIndex: currentIndex, prevFlashStreak: flashStreak, cardId: card.id, prevCardSRS }
    const newUnknown = [...unknown, card.id]
    const nextIndex = currentIndex + 1
    const isComplete = nextIndex >= sessionCards.length
    useSRSStore.getState().updateSRS(card.id, setId, false)
    set({ unknown: newUnknown, currentIndex: nextIndex, isComplete, flashStreak: mode === 'flashcard' ? 0 : flashStreak, lastAction: snapshot })
    if (isComplete) { get()._persist(get().known, newUnknown, sessionCards.length, mode, setId, true) }
    else { get().saveProgress() }
  },

  undoLast: () => {
    const { lastAction, setId } = get()
    if (!lastAction) return
    useSRSStore.getState().revertSRS(lastAction.cardId, setId, lastAction.prevCardSRS)
    set({
      currentIndex: lastAction.prevIndex,
      known: lastAction.prevKnown,
      unknown: lastAction.prevUnknown,
      flashStreak: lastAction.prevFlashStreak,
      isComplete: false,
      lastAction: null,
    })
  },

  submitTyped: () => {
    const { sessionCards, currentIndex, typedAnswer } = get()
    const correct = isFuzzyMatch(typedAnswer, sessionCards[currentIndex].term)
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
      get()._persist(known, finalUnknown, sessionCards.length, mode, setId, true)
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

  setSentenceInput: (val) => set({ sentenceInput: val }),

  submitSentence: async () => {
    const { sessionCards, currentIndex, sentenceInput } = get()
    const card = sessionCards[currentIndex]
    if (!card || !sentenceInput.trim()) return
    set({ sentenceStatus: 'submitting' })
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/review-sentence', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'authorization': `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ term: card.term, definition: card.definition, sentence: sentenceInput.trim() }),
      })
      const data = await res.json()
      set({
        sentenceStatus: 'reviewed',
        sentenceFeedback: data.feedback ?? '',
        sentenceImproved: data.improved ?? null,
        sentenceScore: ['great', 'good', 'needs_work'].includes(data.score) ? data.score : 'good',
      })
    } catch {
      set({ sentenceStatus: 'reviewed', sentenceFeedback: 'Could not reach AI. Moving on.', sentenceImproved: null, sentenceScore: 'good' })
    }
  },

  nextSentenceCard: () => {
    const { sessionCards, currentIndex, sentenceInput, sentenceFeedback, sentenceImproved, sentenceScore, sentenceEntries, mode, setId } = get()
    const card = sessionCards[currentIndex]
    if (!card) return
    const score = sentenceScore ?? 'good'
    useSRSStore.getState().updateSRS(card.id, setId, score !== 'needs_work')
    const newEntries: SentenceEntry[] = [...sentenceEntries, {
      card_id: card.id,
      term: card.term, definition: card.definition,
      sentence: sentenceInput.trim(),
      feedback: sentenceFeedback,
      improved: sentenceImproved,
      score,
    }]
    const nextIndex = currentIndex + 1
    const isComplete = nextIndex >= sessionCards.length
    set({
      sentenceEntries: newEntries, currentIndex: nextIndex, isComplete,
      sentenceInput: '', sentenceStatus: 'idle', sentenceFeedback: '', sentenceImproved: null, sentenceScore: null,
    })
    if (isComplete) {
      const goodIds = newEntries.filter(e => e.score !== 'needs_work').map(e => e.card_id)
      const badIds  = newEntries.filter(e => e.score === 'needs_work').map(e => e.card_id)
      get()._persist(goodIds, badIds, newEntries.length, mode, setId, true)
    }
  },

  resetSession: () => {
    _persistController?.abort()
    _persistController = null
    set({ sessionCards: [], currentIndex: 0, known: [], unknown: [], isComplete: false, typedAnswer: '', typedResult: 'idle', selectedOption: null, mcResult: 'idle', mcStreak: 0, flashStreak: 0, isAdvancing: false, lastAction: null, timerSecsLeft: 0, persistError: null, persistAttempt: 0, isPersisting: false, persistSaved: false, sentenceInput: '', sentenceStatus: 'idle', sentenceFeedback: '', sentenceImproved: null, sentenceScore: null, sentenceEntries: [] })
  },

  persistSession: async () => {
    const { known, unknown, sessionCards, mode, setId } = get()
    if (known.length === 0 && unknown.length === 0) return
    await get()._persist(known, unknown, sessionCards.length, mode, setId)
  },

  retryPersist: async () => {
    const { _lastPersistArgs } = get() as any
    if (!_lastPersistArgs) return
    set({ persistAttempt: get().persistAttempt + 1 })
    await get()._persist(..._lastPersistArgs as Parameters<StudyState['_persist']>)
  },

  dismissPersistError: () => {
    // Cancel any in-flight request and clear error state
    _persistController?.abort()
    _persistController = null
    set({ persistError: null, isPersisting: false, persistAttempt: 0 })
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
      typedAnswer: '', typedResult: 'idle', selectedOption: null, mcResult: 'idle', mcStreak: 0, flashStreak: 0,
      isAdvancing: false, lastAction: null,
      persistError: null,
    })
  },

  saveProgress: () => {
    // Debounce: if cards are answered rapidly, collapse saves into one upsert
    if (_saveDebounceTimer) clearTimeout(_saveDebounceTimer)
    _saveDebounceTimer = setTimeout(async () => {
      const { sessionCards, currentIndex, known, unknown, mode, setId, doShuffle, timerDurMin, isComplete } = get()
      if (isComplete || !setId || setId === '__master__' || mode === 'sentence' || sessionCards.length === 0) return
      try {
        const user = useAuthStore.getState().user
        if (!user) return
        const upsert = supabase.from('session_drafts').upsert({
          user_id: user.id, set_id: setId, mode,
          card_order: sessionCards.map(c => c.id),
          current_index: currentIndex,
          known_ids: known, unknown_ids: unknown,
          do_shuffle: doShuffle, timer_dur_min: timerDurMin,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,set_id' })
        const timeout = new Promise<void>(r => setTimeout(r, 8000))
        await Promise.race([upsert, timeout])
      } catch (err) {
        // Draft save failure is non-critical — silently ignore
        console.warn('Draft save failed (non-critical):', err)
      }
    }, 1500)
  },

  loadProgress: async (setId) => {
    set({ draftLoading: true, hasDraft: false })
    const user = useAuthStore.getState().user
    if (!user) { set({ draftLoading: false }); return null }
    const { data } = await supabase.from('session_drafts').select('*')
      .eq('user_id', user.id).eq('set_id', setId).maybeSingle()
    if (data) {
      // Clear if expired (7 days old)
      const expired = Date.now() - new Date(data.updated_at).getTime() > 7 * 24 * 60 * 60 * 1000
      // Clear if session was already fully completed
      const completed = data.current_index >= data.card_order.length
      if (expired || completed) {
        get().clearProgress(setId)
        set({ draftLoading: false, hasDraft: false })
        return null
      }
    }
    set({ draftLoading: false, hasDraft: !!data })
    return (data as SessionDraft) ?? null
  },

  clearProgress: async (setId) => {
    const user = useAuthStore.getState().user
    if (!user) return
    await supabase.from('session_drafts').delete()
      .eq('user_id', user.id).eq('set_id', setId)
    set({ hasDraft: false })
  },

  _persist: async (known: string[], unknown: string[], total: number, mode: StudyMode, setId: string, clearDraft = false) => {
    if (!setId || setId === '__master__') return
    ;(get() as any)._lastPersistArgs = [known, unknown, total, mode, setId, clearDraft]

    // Cancel any previous in-flight request before starting a new one
    _persistController?.abort()
    _persistController = new AbortController()
    const signal = _persistController.signal

    set({ persistError: null, isPersisting: true, persistSaved: false })

    const attempt = get().persistAttempt
    const slowWarn = setTimeout(() => {
      if (signal.aborted) return
      set({ persistError: 'Slow connection — still saving, hang tight…' })
    }, 8000)
    const deadline = setTimeout(() => {
      if (signal.aborted) return
      _persistController?.abort()
      set({ isPersisting: false, persistError: attempt >= 2 ? 'Still failing — session may not have saved. You can dismiss or keep retrying.' : 'Save timed out — tap Retry' })
    }, 25000)

    try {
      const user = useAuthStore.getState().user
      if (!user) { clearTimeout(slowWarn); clearTimeout(deadline); set({ isPersisting: false }); return }
      const { error } = await (supabase.from('study_sessions').insert({
        user_id: user.id, set_id: setId, mode, total_cards: total,
        known_count: known.length, unknown_count: unknown.length,
        score_pct: total > 0 ? Math.round((known.length / total) * 100) : 0,
        completed_at: new Date().toISOString(),
      }) as any).abortSignal(signal)
      clearTimeout(slowWarn); clearTimeout(deadline)
      if (signal.aborted) return  // this call was superseded by a retry
      if (error) {
        const code = (error as any).code ?? 'unknown'
        const msg = error.message ?? 'unknown error'
        console.error('study_sessions insert failed:', code, msg)
        set({ persistError: `Save error — ${msg}`, isPersisting: false })
        return
      }
      if (clearDraft) get().clearProgress(setId)
      useProgressStore.getState().fetchProgress()
      set({ isPersisting: false, persistSaved: true, persistAttempt: 0 })
    } catch (err: any) {
      clearTimeout(slowWarn); clearTimeout(deadline)
      if (signal.aborted) return  // aborted by retry or dismiss — don't show error
      const msg = err?.message ?? 'unknown error'
      console.error('study_sessions persist error:', err?.code, msg)
      set({ persistError: `Save error — ${msg}`, isPersisting: false })
    }
  },
}))
