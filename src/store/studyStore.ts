import { registerAccountReset } from '@/lib/accountState'
import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { Card, StudyMode, SessionDraft, SentenceEntry } from '@/lib/database.types'
import { generateMCQuestions, type MCQuestion } from '@/lib/multipleChoice'
import { isFuzzyMatch } from '@/lib/fuzzy'
import { useSRSStore } from './srsStore'
import { useProgressStore } from './progressStore'
import { useAuthStore } from './authStore'
import { queueWrite, readLocal, writeLocal, flushPending, hasPending } from '@/lib/sync'
import { getMasteryLevel } from '@/lib/mastery'
import { shuffle } from '@/lib/shuffle'

interface StudyState {
  answeredAt: string | null
  editingCard: boolean
  masteryBefore: Record<string, number> | null
  replaceCard: (card: Card) => void
  sessionId: string | null
  sentenceError: string | null
  // ── Learn mode ──────────────────────────────────────────────
  learnTurn: number
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
  answerLearnCard: (correct: boolean, expected?: { sessionId: string | null; turn: number }) => void
  advanceToNextBatch: () => void
  completeLearnStory: () => void
  resetLearn: () => void
  // ────────────────────────────────────────────────────────────
  mode: StudyMode; setId: string
  sessionCards: Card[]; mcQuestions: MCQuestion[]
  unshuffledOrder: string[]
  currentIndex: number; known: string[]; unknown: string[]; isComplete: boolean
  doShuffle: boolean; timerOn: boolean; timerDurMin: number; timerSecsLeft: number
  typedAnswer: string; typedResult: 'idle' | 'correct' | 'incorrect'
  selectedOption: number | null; mcResult: 'idle' | 'correct' | 'incorrect'; mcStreak: number; flashStreak: number
  isAdvancing: boolean
  lastAction: { prevAnsweredAt: string | null; prevKnown: string[]; prevUnknown: string[]; prevIndex: number; prevFlashStreak: number; cardId: string; prevCardSRS: import('./srsStore').CardSRS | null } | null
  persistError: string | null
  persistAttempt: number
  _lastPersistArgs: Parameters<StudyState['_persist']> | null
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
  startSession: (cards: Card[], mode: StudyMode, setId: string, opts?: { shuffle?: boolean; timerDurMin?: number; sessionId?: string }) => void
  resumeSession: (draft: SessionDraft, cards: Card[]) => void
  saveProgress: () => void
  loadProgress: (setId: string) => Promise<SessionDraft | null>
  clearProgress: (setId: string) => Promise<void>
  markKnown: () => void; markUnknown: () => void; undoLast: () => void
  submitTyped: () => void; setTypedAnswer: (val: string) => void
  selectMCOption: (idx: number) => void
  toggleShuffle: () => void
  tickTimer: () => void; resetSession: () => void
  persistSession: () => Promise<void>
  retryPersist: () => Promise<void>
  dismissPersistError: () => void
  _persist: (known: string[], unknown: string[], total: number, mode: StudyMode, setId: string, clearDraft?: boolean) => Promise<void>
}

const LEARN_BATCH_SIZE = 5
const draftKey = (user: string, scope: string) => `memo:draft:${user}:${scope}`
// Cross-set scopes (Master Deck, Daily 10) are named __like_this__ and belong to no single set
const setRowId = (scope: string) => (scope.startsWith('__') ? null : scope)

/**
 * What a saved draft holds, for the resume prompt. Learn never advances
 * current_index, so its progress comes from practised (graduated) cards and
 * the cards answered at least once.
 */
export function draftProgress(draft: SessionDraft) {
  const total = draft.card_order.length
  const graduated = draft.state?.learnGraduated ?? []
  const started = draft.mode === 'learn'
    ? new Set([...draft.known_ids, ...draft.unknown_ids, ...graduated]).size
    : Math.min(draft.current_index, total)
  const done = draft.mode === 'learn' ? new Set(graduated).size : started
  const hasProgress = started > 0 || !!draft.state?.sentenceInput?.trim()
  return { total, done, started, hasProgress }
}
const initialLearn = {
  learnTurn: 0, learnActive: false, learnCards: [] as Card[], learnBatch: [] as Card[], learnQueue: [] as Card[],
  learnGraduated: [] as string[], learnScores: {} as Record<string, number>, learnBatchIdx: 0,
  learnComplete: false, learnSetId: '', learnBatchComplete: false, learnBatchSummary: [] as Card[], learnStoryReady: false,
}
const initialSession = {
  answeredAt: null as string | null, editingCard: false, masteryBefore: null as Record<string, number> | null,
  sessionId: null as string | null, mode: 'flashcard' as StudyMode, setId: '', sessionCards: [] as Card[], mcQuestions: [] as MCQuestion[],
  currentIndex: 0, known: [] as string[], unknown: [] as string[], isComplete: false,
  unshuffledOrder: [] as string[],
  doShuffle: false, timerOn: false, timerDurMin: 0, timerSecsLeft: 0,
  typedAnswer: '', typedResult: 'idle' as const, selectedOption: null, mcResult: 'idle' as const, mcStreak: 0, flashStreak: 0,
  isAdvancing: false, lastAction: null, persistError: null, persistAttempt: 0, _lastPersistArgs: null,
  hasDraft: false, draftLoading: false, isPersisting: false, persistSaved: false,
  sentenceInput: '', sentenceStatus: 'idle' as const, sentenceFeedback: '', sentenceImproved: null,
  sentenceScore: null, sentenceEntries: [] as SentenceEntry[], sentenceError: null,
}

const snapshotMastery = () => Object.fromEntries(Object.entries(useSRSStore.getState().cardSRS).map(([id, srs]) => [id, getMasteryLevel(srs)]))

export const useStudyStore = create<StudyState>((set, get) => ({
  ...initialSession, ...initialLearn,

  replaceCard: card => {
    const s = get()
    const patch = (cards: Card[]) => cards.map(c => c.id === card.id ? card : c)
    const cards = patch(s.sessionCards)
    set({ sessionCards: cards, learnCards: patch(s.learnCards), learnBatch: patch(s.learnBatch),
      learnQueue: patch(s.learnQueue), learnBatchSummary: patch(s.learnBatchSummary),
      mcQuestions: s.mode === 'multiple_choice' ? generateMCQuestions(cards) : s.mcQuestions,
      sentenceStatus: 'idle', sentenceFeedback: '', sentenceImproved: null, sentenceScore: null, sentenceError: null,
    })
    get().saveProgress()
  },
  startSession: (cards, mode, setId, opts = {}) => {
    get().saveProgress()
    const due = new Set(useSRSStore.getState().getDueCards(setId, cards))
    let ordered = [...cards.filter(c => due.has(c.id)), ...cards.filter(c => !due.has(c.id))]
    const unshuffledOrder = ordered.map(c => c.id)
    if (opts.shuffle) ordered = shuffle(ordered)
    set({ ...initialSession, ...initialLearn, sessionId: opts.sessionId ?? crypto.randomUUID(), masteryBefore: snapshotMastery(), mode, setId, sessionCards: ordered,
      mcQuestions: mode === 'multiple_choice' ? generateMCQuestions(ordered) : [],
      unshuffledOrder, doShuffle: !!opts.shuffle, timerOn: !!opts.timerDurMin, timerDurMin: opts.timerDurMin ?? 0,
      timerSecsLeft: (opts.timerDurMin ?? 0) * 60 })
    get().saveProgress()
  },

  startLearnSession: (cards, setId) => {
    get().saveProgress()
    if (!cards.length) return
    const due = new Set(useSRSStore.getState().getDueCards(setId, cards))
    const ordered = [...shuffle(cards.filter(c => due.has(c.id))), ...shuffle(cards.filter(c => !due.has(c.id)))]
    set({ ...initialSession, ...initialLearn, sessionId: crypto.randomUUID(), masteryBefore: snapshotMastery(), mode: 'learn', setId,
      sessionCards: ordered, learnActive: true, learnCards: ordered, learnSetId: setId,
      learnBatch: ordered.slice(0, LEARN_BATCH_SIZE), learnQueue: ordered.slice(LEARN_BATCH_SIZE) })
    get().saveProgress()
  },
  answerLearnCard: (correct, expected) => {
    const s = get(), card = s.learnBatch[s.learnBatchIdx]
    if (s.editingCard || !s.learnActive || s.learnComplete || s.learnStoryReady || s.learnBatchComplete || !card) return
    if (expected && (s.sessionId !== expected.sessionId || s.learnTurn !== expected.turn)) return
    const scores = { ...s.learnScores, [card.id]: correct ? (s.learnScores[card.id] ?? 0) + 1 : 0 }
    const graduated = scores[card.id] >= 2
    // Recognition is practice; successful recall earns the review credit.
    // Record mistakes immediately so retrying cannot hide a lapse.
    if (!correct || graduated) void useSRSStore.getState().updateSRS(card.id, card.set_id, correct)
    const batch = graduated ? s.learnBatch.filter(c => c.id !== card.id) : s.learnBatch
    set({ answeredAt: new Date().toISOString(), learnTurn: s.learnTurn + 1, learnScores: scores, learnBatch: batch,
      learnGraduated: graduated ? [...s.learnGraduated, card.id] : s.learnGraduated,
      learnBatchSummary: graduated ? [...s.learnBatchSummary, card] : s.learnBatchSummary,
      learnBatchIdx: batch.length ? (graduated ? s.learnBatchIdx : s.learnBatchIdx + 1) % batch.length : 0,
      learnStoryReady: batch.length === 0,
      known: [...s.known.filter(id => id !== card.id), ...(correct ? [card.id] : [])],
      unknown: [...s.unknown.filter(id => id !== card.id), ...(!correct ? [card.id] : [])],
    })
    get().saveProgress()
  },
  advanceToNextBatch: () => {
    const { learnQueue, learnActive, learnBatchComplete, learnComplete } = get()
    if (!learnActive || !learnBatchComplete || learnComplete || !learnQueue.length) return
    set({ learnBatch: learnQueue.slice(0, LEARN_BATCH_SIZE), learnQueue: learnQueue.slice(LEARN_BATCH_SIZE),
      learnBatchComplete: false, learnBatchSummary: [], learnBatchIdx: 0, learnScores: {}, learnStoryReady: false })
    get().saveProgress()
  },
  completeLearnStory: () => {
    const s = get()
    if (!s.learnActive || !s.learnStoryReady || s.learnComplete || s.learnBatch.length) return
    if (s.learnQueue.length) { set({ learnStoryReady: false, learnBatchComplete: true }); get().saveProgress() }
    else {
      set({ learnStoryReady: false, learnBatchComplete: false, learnComplete: true, isComplete: true })
      void get()._persist(s.learnGraduated, [], s.learnCards.length, 'learn', s.learnSetId, true)
    }
  },
  resetLearn: () => { get().saveProgress(); set({ ...initialLearn, ...initialSession }) },
  resetSession: () => { get().saveProgress(); set({ ...initialLearn, ...initialSession }) },

  markKnown: () => answer(true),
  markUnknown: () => answer(false),
  undoLast: () => {
    const s = get(), last = s.lastAction
    if (s.editingCard || !last || s.isComplete) return
    const card = s.sessionCards[last.prevIndex]
    useSRSStore.getState().revertSRS(last.cardId, card.set_id, last.prevCardSRS)
    set({ answeredAt: last.prevAnsweredAt, currentIndex: last.prevIndex, known: last.prevKnown, unknown: last.prevUnknown,
      flashStreak: last.prevFlashStreak, isComplete: false, isAdvancing: false, lastAction: null })
    const user = useAuthStore.getState().user
    if (user) queueSession(get(), user.id) // zero answers must replace a previously recorded answer, too
    get().saveProgress()
  },
  submitTyped: () => {
    const s = get(), card = s.sessionCards[s.currentIndex]
    if (s.editingCard || !card || s.isComplete || s.typedResult !== 'idle') return
    const correct = isFuzzyMatch(s.typedAnswer, card.term)
    set({ typedResult: correct ? 'correct' : 'incorrect' })
    setTimeout(() => {
      if (get().sessionId !== s.sessionId || get().currentIndex !== s.currentIndex || get().isComplete) return
      if (correct) get().markKnown(); else get().markUnknown()
      set({ typedAnswer: '', typedResult: 'idle' })
    }, 1200)
  },
  setTypedAnswer: val => { set({ typedAnswer: val }); get().saveProgress() },
  selectMCOption: idx => {
    const s = get(), q = s.mcQuestions[s.currentIndex]
    if (s.editingCard || !q || s.isComplete || s.mcResult !== 'idle' || idx < 0 || idx >= q.options.length) return
    const correct = idx === q.correctIndex
    set({ selectedOption: idx, mcResult: correct ? 'correct' : 'incorrect', mcStreak: correct ? s.mcStreak + 1 : 0 })
    setTimeout(() => {
      if (get().sessionId !== s.sessionId || get().currentIndex !== s.currentIndex || get().isComplete) return
      if (correct) get().markKnown(); else get().markUnknown()
      set({ selectedOption: null, mcResult: 'idle' })
    }, 1000)
  },
  tickTimer: () => {
    const s = get()
    if (s.editingCard || s.isComplete || s.timerSecsLeft <= 0) return
    set({ timerSecsLeft: s.timerSecsLeft - 1 })
    if (s.timerSecsLeft === 1) {
      set({ isComplete: true })
      void get()._persist(s.known, s.unknown, s.known.length + s.unknown.length, s.mode, s.setId, true)
    } else get().saveProgress()
  },
  toggleShuffle: () => {
    const s = get()
    if (s.editingCard || s.isComplete || s.mcResult !== 'idle' || s.typedResult !== 'idle' || s.isAdvancing) return
    const doShuffle = !s.doShuffle
    // Keep the visible question and completed answers in place when switching modes.
    const start = s.currentIndex + 1
    const remaining = s.sessionCards.slice(start)
    const order = new Map(s.unshuffledOrder.map((id, index) => [id, index]))
    const upcoming = doShuffle ? shuffle(remaining) : remaining.sort((a, b) =>
      (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.id) ?? Number.MAX_SAFE_INTEGER))
    const cards = [...s.sessionCards.slice(0, start), ...upcoming]
    const questions = new Map(s.mcQuestions.map(question => [question.card.id, question]))
    set({ doShuffle, sessionCards: cards, mcQuestions: s.mode === 'multiple_choice' ? cards.map(card => questions.get(card.id)!) : [] })
    get().saveProgress()
  },
  setSentenceInput: val => { set({ sentenceInput: val, sentenceError: null }); get().saveProgress() },
  submitSentence: async () => {
    const s = get(), card = s.sessionCards[s.currentIndex]
    if (s.editingCard || !card || !s.sentenceInput.trim() || s.sentenceStatus !== 'idle') return
    set({ sentenceStatus: 'submitting', sentenceError: null })
    const controller = new AbortController()
    const deadline = setTimeout(() => controller.abort(), 25000)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/review-sentence', { method: 'POST', signal: controller.signal,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ term: card.term, definition: card.definition, sentence: s.sentenceInput.trim() }) })
      const data = await res.json()
      if (!res.ok || !['great', 'good', 'needs_work'].includes(data.score)) throw new Error(data.error ?? 'Review unavailable')
      if (get().sessionId !== s.sessionId || get().currentIndex !== s.currentIndex) return
      set({ sentenceStatus: 'reviewed', sentenceFeedback: data.feedback ?? '', sentenceImproved: data.improved ?? null, sentenceScore: data.score })
    } catch {
      if (get().sessionId !== s.sessionId || get().currentIndex !== s.currentIndex) return
      set({ sentenceStatus: 'idle', sentenceError: 'Could not review your sentence. Your text is kept — please try again.', sentenceScore: null })
    } finally { clearTimeout(deadline) }
    get().saveProgress()
  },
  nextSentenceCard: () => {
    const s = get(), card = s.sessionCards[s.currentIndex]
    if (s.editingCard || !card || s.sentenceStatus !== 'reviewed' || !s.sentenceScore) return
    const correct = s.sentenceScore !== 'needs_work'
    useSRSStore.getState().updateSRS(card.id, card.set_id, correct)
    const entries = [...s.sentenceEntries, { card_id: card.id, term: card.term, definition: card.definition,
      sentence: s.sentenceInput.trim(), feedback: s.sentenceFeedback, improved: s.sentenceImproved, score: s.sentenceScore }]
    const known = [...s.known, ...(correct ? [card.id] : [])], unknown = [...s.unknown, ...(!correct ? [card.id] : [])]
    const complete = s.currentIndex + 1 >= s.sessionCards.length
    set({ answeredAt: new Date().toISOString(), sentenceEntries: entries, currentIndex: s.currentIndex + 1, known, unknown, isComplete: complete,
      sentenceInput: '', sentenceStatus: 'idle', sentenceFeedback: '', sentenceImproved: null, sentenceScore: null })
    if (complete) void get()._persist(known, unknown, entries.length, s.mode, s.setId, true)
    else get().saveProgress()
  },

  saveProgress: () => {
    const s = get(), user = useAuthStore.getState().user
    if (!user || !s.sessionId || !s.setId || !s.sessionCards.length || s.isComplete) return
    const state = {
      answeredAt: s.answeredAt, unshuffledOrder: s.unshuffledOrder,
      masteryBefore: s.masteryBefore, timerSecsLeft: s.timerSecsLeft, sentenceInput: s.sentenceInput, sentenceEntries: s.sentenceEntries,
      sentenceStatus: s.sentenceStatus === 'submitting' ? 'idle' : s.sentenceStatus,
      sentenceFeedback: s.sentenceFeedback, sentenceImproved: s.sentenceImproved, sentenceScore: s.sentenceScore,
      typedAnswer: s.typedAnswer, learnBatch: s.learnBatch.map(c => c.id), learnQueue: s.learnQueue.map(c => c.id),
      learnGraduated: s.learnGraduated, learnScores: s.learnScores, learnBatchIdx: s.learnBatchIdx,
      learnBatchComplete: s.learnBatchComplete, learnBatchSummary: s.learnBatchSummary.map(c => c.id), learnStoryReady: s.learnStoryReady,
    }
    const draft = { user_id: user.id, set_id: setRowId(s.setId), scope_id: s.setId,
      session_id: s.sessionId, mode: s.mode, card_order: s.sessionCards.map(c => c.id), current_index: s.currentIndex,
      known_ids: s.known, unknown_ids: s.unknown, do_shuffle: s.doShuffle, timer_dur_min: s.timerDurMin,
      updated_at: new Date().toISOString(), state }
    writeLocal(draftKey(user.id, s.setId), draft)
    queueWrite({ userId: user.id, key: `draft:${s.setId}`, table: 'session_drafts', operation: 'upsert', data: draft, conflict: 'user_id,scope_id' })
    // Checkpoint the same session ID, so leaving/resuming/retrying cannot double count it.
    if (s.known.length + s.unknown.length > 0) queueSession(s, user.id)
  },
  loadProgress: async setId => {
    const user = useAuthStore.getState().user
    if (!user) return null
    const local = readLocal<SessionDraft & { deleted?: boolean }>(draftKey(user.id, setId))
    // Local unsynced work must remain available even when the network is stalled.
    if (local && hasPending(user.id, `draft:${setId}`)) return local.deleted ? null : local
    set({ draftLoading: true })
    const controller = new AbortController()
    const deadline = setTimeout(() => controller.abort(), 8000)
    try {
      const { data, error } = await supabase.from('session_drafts').select('*')
        .eq('user_id', user.id).eq('scope_id', setId).abortSignal(controller.signal).maybeSingle()
      if (useAuthStore.getState().user?.id !== user.id) return null
      if (error) { set({ persistError: `Could not check cloud progress: ${error.message}` }); return local && !local.deleted ? local : null }
      // A local answer may have arrived while the read was in flight.
      const latest = readLocal<SessionDraft & { deleted?: boolean }>(draftKey(user.id, setId))
      if (latest && (hasPending(user.id, `draft:${setId}`) || (data && latest.updated_at >= data.updated_at))) return latest.deleted ? null : latest
      writeLocal(draftKey(user.id, setId), data ?? { deleted: true, updated_at: new Date().toISOString() })
      set({ hasDraft: !!data })
      return data as SessionDraft | null
    } catch { return local && !local.deleted ? local : null }
    finally { clearTimeout(deadline); if (useAuthStore.getState().user?.id === user.id) set({ draftLoading: false }) }
  },
  clearProgress: async setId => {
    const user = useAuthStore.getState().user
    if (!user) return
    writeLocal(draftKey(user.id, setId), { deleted: true, updated_at: new Date().toISOString() })
    queueWrite({ userId: user.id, key: `draft:${setId}`, table: 'session_drafts', operation: 'delete', filters: { user_id: user.id, scope_id: setId } })
    set({ hasDraft: false })
  },
  resumeSession: (draft, cards) => {
    const scope = draft.scope_id ?? draft.set_id
    const byId = new Map(cards.map(c => [c.id, c]))
    const resolve = (ids: string[] = []) => ids.map(id => byId.get(id)).filter((c): c is Card => !!c)
    const ordered = resolve(draft.card_order)
    if (!ordered.length) { void get().clearProgress(scope); return }
    const state = draft.state ?? {}
    const known = draft.known_ids.filter(id => byId.has(id)), unknown = draft.unknown_ids.filter(id => byId.has(id))
    // Recompute position after removed cards; an old numeric index would skip survivors.
    const index = resolve(draft.card_order.slice(0, draft.current_index)).length
    const learning = draft.mode === 'learn'
    // Reconcile by identity: deleted cards must not shift the current card or skip survivors.
    const valid = new Set(ordered.map(c => c.id))
    const graduated = [...new Set(state.learnGraduated ?? [])].filter(id => valid.has(id))
    const assigned = new Set(graduated)
    const uniqueCards = (ids: string[] = []) => resolve(ids).filter(c => {
      if (!valid.has(c.id) || assigned.has(c.id)) return false
      assigned.add(c.id); return true
    })
    let batch = uniqueCards(state.learnBatch)
    let queue = uniqueCards(state.learnQueue)
    queue.push(...ordered.filter(c => !assigned.has(c.id)))
    const summary = resolve(state.learnBatchSummary).filter(c => graduated.includes(c.id))
    const betweenBatches = !batch.length && summary.length > 0 && (state.learnStoryReady || state.learnBatchComplete)
    if (!batch.length && !betweenBatches && queue.length) {
      batch = queue.slice(0, LEARN_BATCH_SIZE); queue = queue.slice(LEARN_BATCH_SIZE)
    }
    const nextSurvivor = (state.learnBatch ?? []).slice(state.learnBatchIdx ?? 0).find(id => batch.some(c => c.id === id))
    const batchIndex = Math.max(0, batch.findIndex(c => c.id === nextSurvivor))
    set({ ...initialSession, ...initialLearn, sessionId: draft.session_id ?? draft.id ?? crypto.randomUUID(),
      answeredAt: state.answeredAt ?? (known.length + unknown.length ? draft.updated_at : null),
      masteryBefore: state.masteryBefore ?? null, setId: scope, mode: draft.mode, sessionCards: ordered, known, unknown, currentIndex: index,
      unshuffledOrder: (state.unshuffledOrder ?? cards.map(card => card.id)).filter(id => byId.has(id)),
      isComplete: !learning && index >= ordered.length, doShuffle: draft.do_shuffle,
      mcQuestions: draft.mode === 'multiple_choice' ? generateMCQuestions(ordered) : [],
      timerOn: draft.timer_dur_min > 0, timerDurMin: draft.timer_dur_min,
      timerSecsLeft: state.timerSecsLeft ?? draft.timer_dur_min * 60,
      typedAnswer: state.typedAnswer ?? '', sentenceInput: state.sentenceInput ?? '',
      sentenceEntries: (state.sentenceEntries ?? []).filter(e => byId.has(e.card_id)),
      sentenceStatus: state.sentenceStatus === 'reviewed' ? 'reviewed' : 'idle', sentenceFeedback: state.sentenceFeedback ?? '',
      sentenceImproved: state.sentenceImproved ?? null, sentenceScore: state.sentenceScore ?? null,
      ...(learning ? { learnActive: true, learnCards: ordered, learnSetId: scope,
        learnBatch: batch, learnQueue: queue,
        learnGraduated: graduated, learnScores: Object.fromEntries(batch.map(c => [c.id, Math.min(1, Math.max(0, state.learnScores?.[c.id] ?? 0))])),
        learnBatchIdx: batchIndex,
        learnBatchComplete: !!betweenBatches && !!state.learnBatchComplete, learnBatchSummary: summary,
        learnStoryReady: !batch.length && !(betweenBatches && state.learnBatchComplete) } : {}),
    })
    get().saveProgress()
  },
  persistSession: async () => {
    get().saveProgress()
    const s = get()
    if (s.known.length + s.unknown.length) await get()._persist(s.known, s.unknown, s.known.length + s.unknown.length, s.mode, s.setId)
  },
  retryPersist: async () => {
    const id = get().sessionId, user = useAuthStore.getState().user
    set({ isPersisting: true, persistError: null })
    await flushPending()
    if (get().sessionId !== id) return
    const pending = user && hasPending(user.id, `session:${id}`)
    set({ isPersisting: false, persistSaved: !pending, persistError: pending ? 'Saved on this device; waiting to sync. Retry when connected.' : null })
  },
  dismissPersistError: () => set({ persistError: null }),
  _persist: async (known, unknown, _total, mode, setId, clearDraft = false) => {
    const s = get(), user = useAuthStore.getState().user
    if (!user || !s.sessionId) return
    const id = s.sessionId
    set({ isPersisting: true, persistSaved: false, persistError: null })
    if (known.length + unknown.length) queueSession({ ...s, known, unknown, mode, setId }, user.id)
    if (clearDraft) await get().clearProgress(setId)
    await flushPending()
    if (get().sessionId !== id) return
    const pending = hasPending(user.id, `session:${id}`)
    set({ isPersisting: false, persistSaved: !pending, persistError: pending ? 'Saved on this device; waiting to sync. Retry when connected.' : null })
    if (!pending) void useProgressStore.getState().fetchProgress(true)
  },
}))

function queueSession(s: StudyState, userId: string) {
  const total = s.known.length + s.unknown.length
  queueWrite({ userId, key: `session:${s.sessionId}`, table: 'study_sessions', operation: 'upsert', conflict: 'id', data: {
    id: s.sessionId, user_id: userId, set_id: setRowId(s.setId), mode: s.mode,
    total_cards: total, known_count: s.known.length, unknown_count: s.unknown.length,
    score_pct: total ? Math.round(s.known.length / total * 100) : 0, completed_at: s.answeredAt ?? new Date().toISOString(), sentence_entries: s.sentenceEntries,
  } })
}
function answer(correct: boolean) {
  const s = useStudyStore.getState(), card = s.sessionCards[s.currentIndex]
  if (s.editingCard || !card || s.isComplete || s.isAdvancing || s.learnActive) return
  const known = [...s.known, ...(correct ? [card.id] : [])], unknown = [...s.unknown, ...(!correct ? [card.id] : [])]
  const complete = s.currentIndex + 1 >= s.sessionCards.length
  const previous = useSRSStore.getState().cardSRS[card.id] ?? null
  useSRSStore.getState().updateSRS(card.id, card.set_id, correct)
  useStudyStore.setState({ answeredAt: new Date().toISOString(), known, unknown, currentIndex: s.currentIndex + 1, isComplete: complete, isAdvancing: true,
    flashStreak: correct ? s.flashStreak + 1 : 0,
    lastAction: { prevAnsweredAt: s.answeredAt, prevKnown: s.known, prevUnknown: s.unknown, prevIndex: s.currentIndex, prevFlashStreak: s.flashStreak, cardId: card.id, prevCardSRS: previous } })
  setTimeout(() => { if (useStudyStore.getState().sessionId === s.sessionId) useStudyStore.setState({ isAdvancing: false }) }, 400)
  if (complete) void useStudyStore.getState()._persist(known, unknown, known.length + unknown.length, s.mode, s.setId, true)
  else useStudyStore.getState().saveProgress()
}

registerAccountReset(() => useStudyStore.setState(useStudyStore.getInitialState(), true))
