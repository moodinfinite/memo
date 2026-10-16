import { readAllRows } from '@/lib/readAllRows'
import { localDayStr } from '@/lib/localDate'
import { registerAccountReset } from '@/lib/accountState'
import { queueWrite, pendingWrites, readLocal, writeLocal } from '@/lib/sync'
import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from './authStore'

/**
 * Simplified SM-2 spaced repetition algorithm.
 * Each card has an ease factor (EF) and interval (days until next review).
 * Cards answered correctly increase their interval; incorrect resets to 1 day.
 */

export interface CardSRS {
  card_id: string
  set_id: string
  easiness: number       // EF — starts at 2.5, min 1.3
  interval: number       // days until next review
  repetitions: number    // consecutive correct answers
  next_review: string    // ISO date
  last_seen_at: string
}

interface SRSState {
  cardSRS: Record<string, CardSRS>   // keyed by card_id
  lastLocalUpdate: Record<string, number>  // setId -> timestamp of last local write
  srsAllFetchedAt: number
  isLoading: boolean
  fetchSRS: (setId: string, opts?: { force?: boolean }) => Promise<void>
  fetchAllSRS: () => Promise<void>
  updateSRS: (cardId: string, setId: string, known: boolean) => Promise<void>
  revertSRS: (cardId: string, setId: string, prevState: CardSRS | null) => void
  getDueCards: (setId: string, allCards: { id: string }[]) => string[]
}

export function calcNextSRS(current: CardSRS | null, known: boolean): Omit<CardSRS, 'card_id' | 'set_id' | 'last_seen_at'> {
  const ef = current?.easiness ?? 2.5
  const reps = current?.repetitions ?? 0
  const interval = current?.interval ?? 1

  const sameDay = !!current && localDayStr(new Date(current.last_seen_at)) === localDayStr(new Date())
  // Extra practice must not advance an existing schedule; use persisted review dates.
  // A failed card can recover to the introductory step, but cannot climb again today.
  if (known && current && reps > 0 && (sameDay || !isDue(current.next_review))) {
    const { easiness, interval, repetitions, next_review } = current
    return { easiness, interval, repetitions, next_review }
  }
  if (!known) {
    // Wrong answer — reset
    return {
      easiness: sameDay && reps === 0 ? ef : Math.max(1.3, ef - 0.2),
      interval: 1,
      repetitions: 0,
      next_review: daysFromNow(1),
    }
  }

  // Correct answer — increase interval
  const newReps = reps + 1
  let newInterval: number
  if (newReps === 1) newInterval = 1
  else if (newReps === 2) newInterval = 6
  else newInterval = Math.min(365, Math.round(interval * ef))

  const newEF = Math.max(1.3, ef + 0.1)

  return {
    easiness: newEF,
    interval: newInterval,
    repetitions: newReps,
    next_review: daysFromNow(newInterval),
  }
}

function daysFromNow(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return localDayStr(d)
}

function isDue(dateStr: string): boolean {
  const today = localDayStr(new Date())
  return dateStr <= today
}

function withPendingSRS(map: Record<string, CardSRS>, userId: string) {
  const next = { ...map }
  for (const job of pendingWrites(userId)) {
    if (job.table !== 'card_srs') continue
    if (job.operation === 'delete') delete next[job.filters!.card_id]
    else next[job.data!.card_id as string] = job.data as unknown as CardSRS
  }
  return next
}

export const useSRSStore = create<SRSState>((set, get) => ({
  cardSRS: {},
  lastLocalUpdate: {},
  srsAllFetchedAt: 0,
  isLoading: false,

  fetchSRS: async (setId, { force = false } = {}) => {
    // Skip fetch if we wrote local updates in the last 5 seconds — avoids
    // overwriting optimistic state with stale DB data (race condition on navigation).
    // Pass force:true to bypass this when we need fresh data (e.g. before starting a session).
    const lastUpdate = get().lastLocalUpdate[setId] ?? 0
    if (!force && Date.now() - lastUpdate < 5000) return

    const userId = useAuthStore.getState().user?.id
    if (!userId) return
    if (!Object.keys(get().cardSRS).length) set({ cardSRS: withPendingSRS(readLocal<Record<string, CardSRS>>(`memo:srs:${userId}`) ?? {}, userId) })
    const started = Date.now()
    set({ isLoading: true })
    const { data, error } = await readAllRows<CardSRS>((from, to, signal) => supabase
      .from('card_srs').select('*').eq('set_id', setId).eq('user_id', userId)
      .order('card_id').range(from, to).abortSignal(signal))
    if (useAuthStore.getState().user?.id !== userId) return
    if ((get().lastLocalUpdate[setId] ?? 0) >= started) { set({ isLoading: false }); return }
    if (error) { set(state => ({ cardSRS: withPendingSRS(state.cardSRS, userId), isLoading: false })); return }
    const updates: Record<string, CardSRS> = {}
    for (const row of data ?? []) updates[row.card_id] = row
    // Merge into existing map so other sets' data is preserved
    set((state) => ({ cardSRS: withPendingSRS({ ...Object.fromEntries(Object.entries(state.cardSRS).filter(([, row]) => row.set_id !== setId)), ...updates }, userId), isLoading: false }))
  },

  fetchAllSRS: async () => {
    const userId = useAuthStore.getState().user?.id
    if (!userId) return
    // Skip refetch if data is fresh (< 30s old)
    if (Date.now() - get().srsAllFetchedAt < 30_000 && Object.keys(get().cardSRS).length > 0) return

    if (!Object.keys(get().cardSRS).length) set({ cardSRS: withPendingSRS(readLocal<Record<string, CardSRS>>(`memo:srs:${userId}`) ?? {}, userId) })
    const started = Date.now()
    const { data, error } = await readAllRows<CardSRS>((from, to, signal) => supabase.from('card_srs').select('*').eq('user_id', userId).order('card_id').range(from, to).abortSignal(signal))
    if (useAuthStore.getState().user?.id !== userId) return
    if (error) { set(state => ({ cardSRS: withPendingSRS(state.cardSRS, userId) })); return }
    const map: Record<string, CardSRS> = {}
    for (const row of data ?? []) map[row.card_id] = row
    const changedSets = new Set(Object.entries(get().lastLocalUpdate).filter(([, time]) => time >= started).map(([id]) => id))
    for (const [id, row] of Object.entries(map)) if (changedSets.has(row.set_id)) delete map[id]
    for (const [id, row] of Object.entries(get().cardSRS)) if (changedSets.has(row.set_id)) map[id] = row
    set({ cardSRS: withPendingSRS(map, userId), srsAllFetchedAt: Date.now() })
  },

  updateSRS: async (cardId, setId, known) => {
    const current = get().cardSRS[cardId] ?? null
    const next = calcNextSRS(current, known)
    const now = new Date().toISOString()
    const user = useAuthStore.getState().user
    if (!user) return

    const upsertData = {
      card_id: cardId,
      set_id: setId,
      user_id: user.id,
      ...next,
      last_seen_at: now,
    }

    // Optimistic: update UI immediately so card answer feels instant
    set((state) => ({
      cardSRS: { ...state.cardSRS, [cardId]: upsertData },
      lastLocalUpdate: { ...state.lastLocalUpdate, [setId]: Date.now() },
    }))

    // Queue durably before syncing. Failed writes survive refresh and are visible in the app.
    // NOTE: conflict target must match the DB's unique(user_id, card_id)
    // constraint — 'card_id' alone makes Postgres reject the whole upsert.
    queueWrite({ userId: user.id, key: `srs:${cardId}`, table: 'card_srs', operation: 'upsert', data: upsertData, conflict: 'user_id,card_id' })
  },

  revertSRS: (cardId, setId, prevState) => {
    const user = useAuthStore.getState().user
    if (prevState) {
      set((state) => ({
        cardSRS: { ...state.cardSRS, [cardId]: prevState },
        lastLocalUpdate: { ...state.lastLocalUpdate, [setId]: Date.now() },
      }))
      if (!user) return
      queueWrite({ userId: user.id, key: `srs:${cardId}`, table: 'card_srs', operation: 'upsert', data: { ...prevState, user_id: user.id }, conflict: 'user_id,card_id' })
    } else {
      // Card had no SRS record before this session — delete the row we created
      set((state) => {
        const next = { ...state.cardSRS }
        delete next[cardId]
        return { cardSRS: next, lastLocalUpdate: { ...state.lastLocalUpdate, [setId]: Date.now() } }
      })
      if (!user) return
      queueWrite({ userId: user.id, key: `srs:${cardId}`, table: 'card_srs', operation: 'delete', filters: { card_id: cardId, user_id: user.id } })
    }
  },

  getDueCards: (setId, allCards) => {
    const { cardSRS } = get()
    return allCards
      .filter((card) => {
        const srs = cardSRS[card.id]
        if (!srs) return true // Never seen — always due
        return isDue(srs.next_review)
      })
      .map((c) => c.id)
  },
}))

registerAccountReset(() => useSRSStore.setState(useSRSStore.getInitialState(), true))

useSRSStore.subscribe((state, previous) => {
  const userId = useAuthStore.getState().user?.id
  if (userId && state !== useSRSStore.getInitialState() && state.cardSRS !== previous.cardSRS) writeLocal(`memo:srs:${userId}`, state.cardSRS)
})
