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

function calcNextSRS(current: CardSRS | null, known: boolean): Omit<CardSRS, 'card_id' | 'set_id' | 'last_seen_at'> {
  const ef = current?.easiness ?? 2.5
  const reps = current?.repetitions ?? 0
  const interval = current?.interval ?? 1

  if (!known) {
    // Wrong answer — reset
    return {
      easiness: Math.max(1.3, ef - 0.2),
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
  return d.toISOString().split('T')[0]
}

function isDue(dateStr: string): boolean {
  const today = new Date().toISOString().split('T')[0]
  return dateStr <= today
}

// ─────────────────────────────────────────────────────────────
// SRS write queue.
// Saves run one at a time, in the order the user answered. Without this,
// rapid answers fire parallel requests and a slow connection can deliver an
// OLD answer's save after a NEWER one, overwriting it in the database.
// Each write also gets one automatic retry — free-tier connections often
// hiccup once and succeed on the second try.
// ─────────────────────────────────────────────────────────────
let _writeChain: Promise<void> = Promise.resolve()

function enqueueSRSWrite(
  job: () => PromiseLike<{ error: { message: string } | null }>,
  label: string,
) {
  _writeChain = _writeChain
    .then(async () => {
      let { error } = await job()
      if (error) {
        await new Promise((r) => setTimeout(r, 1500))
        ;({ error } = await job())
      }
      if (error) console.error(`${label} failed after retry:`, error.message)
    })
    .catch(() => {}) // never let one failure break the chain
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

    set({ isLoading: true })
    const { data, error } = await supabase
      .from('card_srs')
      .select('*')
      .eq('set_id', setId)
    if (error) console.error('fetchSRS error:', error)
    const updates: Record<string, CardSRS> = {}
    for (const row of data ?? []) updates[row.card_id] = row
    // Merge into existing map so other sets' data is preserved
    set((state) => ({ cardSRS: { ...state.cardSRS, ...updates }, isLoading: false }))
  },

  fetchAllSRS: async () => {
    // Skip refetch if data is fresh (< 30s old)
    if (Date.now() - get().srsAllFetchedAt < 30_000 && Object.keys(get().cardSRS).length > 0) return

    // Re-use set IDs already in setsStore — avoids a redundant round-trip to 'sets' table
    const { useSetsStore } = await import('./setsStore')
    const cachedSetIds = useSetsStore.getState().sets.map(s => s.id)
    let setIds: string[]
    if (cachedSetIds.length > 0) {
      setIds = cachedSetIds
    } else {
      const { data: setsData, error: setsError } = await supabase.from('sets').select('id')
      if (setsError) { console.error('fetchAllSRS sets error:', setsError); return }
      setIds = (setsData ?? []).map((s: { id: string }) => s.id)
    }
    if (setIds.length === 0) return
    const { data, error } = await supabase.from('card_srs').select('*').in('set_id', setIds)
    if (error) { console.error('fetchAllSRS card_srs error:', error); return }
    const map: Record<string, CardSRS> = {}
    for (const row of data ?? []) map[row.card_id] = row
    set({ cardSRS: map, srsAllFetchedAt: Date.now() })
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

    // Sync to DB in background, serialized through the write queue.
    // NOTE: conflict target must match the DB's unique(user_id, card_id)
    // constraint — 'card_id' alone makes Postgres reject the whole upsert.
    enqueueSRSWrite(
      () => supabase.from('card_srs').upsert(upsertData, { onConflict: 'user_id,card_id' }),
      'updateSRS upsert',
    )
  },

  revertSRS: (cardId, setId, prevState) => {
    const user = useAuthStore.getState().user
    if (prevState) {
      set((state) => ({
        cardSRS: { ...state.cardSRS, [cardId]: prevState },
        lastLocalUpdate: { ...state.lastLocalUpdate, [setId]: Date.now() },
      }))
      if (!user) return
      enqueueSRSWrite(
        () => supabase.from('card_srs').upsert({ ...prevState, user_id: user.id }, { onConflict: 'user_id,card_id' }),
        'revertSRS upsert',
      )
    } else {
      // Card had no SRS record before this session — delete the row we created
      set((state) => {
        const next = { ...state.cardSRS }
        delete next[cardId]
        return { cardSRS: next, lastLocalUpdate: { ...state.lastLocalUpdate, [setId]: Date.now() } }
      })
      if (!user) return
      enqueueSRSWrite(
        () => supabase.from('card_srs').delete().eq('card_id', cardId).eq('user_id', user.id),
        'revertSRS delete',
      )
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
