import { create } from 'zustand'
import { supabase } from '@/lib/supabase'

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
  isLoading: boolean
  fetchSRS: (setId: string) => Promise<void>
  fetchAllSRS: () => Promise<void>
  updateSRS: (cardId: string, setId: string, known: boolean) => Promise<void>
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
  else newInterval = Math.round(interval * ef)

  const newEF = Math.max(1.3, ef + 0.1 - (5 - 4) * (0.08 + (5 - 4) * 0.02))

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

function isToday(dateStr: string): boolean {
  const today = new Date().toISOString().split('T')[0]
  return dateStr <= today
}

export const useSRSStore = create<SRSState>((set, get) => ({
  cardSRS: {},
  lastLocalUpdate: {},
  isLoading: false,

  fetchSRS: async (setId) => {
    // Skip fetch if we wrote local updates in the last 5 seconds — avoids
    // overwriting optimistic state with stale DB data (race condition on navigation)
    const lastUpdate = get().lastLocalUpdate[setId] ?? 0
    if (Date.now() - lastUpdate < 5000) return

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
    // A plain select('*') on card_srs can be blocked by RLS without a set_id filter.
    // Fetch the user's set IDs first (from the correct 'sets' table), then filter.
    const { data: setsData, error: setsError } = await supabase.from('sets').select('id')
    if (setsError) { console.error('fetchAllSRS sets error:', setsError); return }
    const setIds = (setsData ?? []).map((s: { id: string }) => s.id)
    if (setIds.length === 0) return
    const { data, error } = await supabase.from('card_srs').select('*').in('set_id', setIds)
    if (error) { console.error('fetchAllSRS card_srs error:', error); return }
    const map: Record<string, CardSRS> = {}
    for (const row of data ?? []) map[row.card_id] = row
    set({ cardSRS: map })
  },

  updateSRS: async (cardId, setId, known) => {
    const current = get().cardSRS[cardId] ?? null
    const next = calcNextSRS(current, known)
    const now = new Date().toISOString()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const upsertData = {
      card_id: cardId,
      set_id: setId,
      user_id: user.id,
      ...next,
      last_seen_at: now,
    }

    const { error: upsertError } = await supabase.from('card_srs').upsert(upsertData)
    if (upsertError) console.error('updateSRS upsert error:', upsertError)

    set((state) => ({
      cardSRS: { ...state.cardSRS, [cardId]: { ...upsertData, easiness: next.easiness, interval: next.interval, repetitions: next.repetitions } },
      lastLocalUpdate: { ...state.lastLocalUpdate, [setId]: Date.now() },
    }))
  },

  getDueCards: (setId, allCards) => {
    const { cardSRS } = get()
    return allCards
      .filter((card) => {
        const srs = cardSRS[card.id]
        if (!srs) return true // Never seen — always due
        return isToday(srs.next_review)
      })
      .map((c) => c.id)
  },
}))
