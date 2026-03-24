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
  isLoading: boolean
  fetchSRS: (setId: string) => Promise<void>
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
  isLoading: false,

  fetchSRS: async (setId) => {
    set({ isLoading: true })
    const { data } = await supabase
      .from('card_srs')
      .select('*')
      .eq('set_id', setId)

    const map: Record<string, CardSRS> = {}
    for (const row of data ?? []) {
      map[row.card_id] = row
    }
    set({ cardSRS: map, isLoading: false })
  },

  updateSRS: async (cardId, setId, known) => {
    const current = get().cardSRS[cardId] ?? null
    const next = calcNextSRS(current, known)
    const now = new Date().toISOString()

    const upsertData = {
      card_id: cardId,
      set_id: setId,
      ...next,
      last_seen_at: now,
    }

    await supabase.from('card_srs').upsert(upsertData)

    set((state) => ({
      cardSRS: { ...state.cardSRS, [cardId]: { ...upsertData, easiness: next.easiness, interval: next.interval, repetitions: next.repetitions } },
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
