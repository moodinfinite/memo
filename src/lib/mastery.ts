import type { CardSRS } from '@/store/srsStore'

export interface SetMastery {
  level: MasteryLevel   // floor of average level across all cards
  pct: number           // % of cards studied at least once (level 1+)
  seenCount: number     // how many cards have an SRS record
}

export type MasteryLevel = 0 | 1 | 2 | 3 | 4

export interface MasteryInfo {
  level: MasteryLevel
  label: string
  color: string        // fill color for the badge
  description: string  // tooltip / description
}

/**
 * Derive a mastery level from a card's SRS record.
 *
 * Level 0 — Unseen:     no SRS record yet
 * Level 1 — Introduced: studied at least once, interval < 3 days
 * Level 2 — Familiar:   2+ correct in a row, interval 3–9 days
 * Level 3 — Confident:  3+ correct in a row, interval 10–20 days
 * Level 4 — Mastered:   4+ correct in a row, interval 21+ days
 */
export function getMasteryLevel(srs: CardSRS | null | undefined): MasteryLevel {
  if (!srs || srs.repetitions === 0) return 0
  const { repetitions: r, interval: i } = srs
  if (r >= 4 && i >= 21) return 4
  if (r >= 3 && i >= 10) return 3
  if (r >= 2 && i >= 3)  return 2
  return 1
}

/**
 * Compute overall mastery for a whole set.
 * Unseen cards (no SRS record) count as level 0.
 */
export function getSetMastery(setId: string, cardCount: number, cardSRS: Record<string, CardSRS>): SetMastery {
  if (cardCount === 0) return { level: 0, pct: 0, seenCount: 0 }
  const records = Object.values(cardSRS).filter(s => s.set_id === setId)
  const seenCount = records.length
  const totalLevel = records.reduce((sum, srs) => sum + getMasteryLevel(srs), 0)
  const avgLevel = totalLevel / cardCount  // unseen cards contribute 0
  const level = Math.min(4, Math.floor(avgLevel)) as MasteryLevel
  const pct = Math.round((seenCount / cardCount) * 100)
  return { level, pct, seenCount }
}

export const MASTERY_INFO: Record<MasteryLevel, MasteryInfo> = {
  0: { level: 0, label: 'Unseen',     color: '#94a3b8', description: 'Not studied yet' },
  1: { level: 1, label: 'Introduced', color: '#60a5fa', description: 'Studied at least once' },
  2: { level: 2, label: 'Familiar',   color: '#f59e0b', description: '2+ correct, short interval' },
  3: { level: 3, label: 'Confident',  color: '#f97316', description: '3+ correct, medium interval' },
  4: { level: 4, label: 'Mastered',   color: '#84cc16', description: '4+ correct, 21+ day interval' },
}
