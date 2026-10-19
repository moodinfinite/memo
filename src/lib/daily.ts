import type { Card, SessionDraft } from '@/lib/database.types'
import type { CardSRS } from '@/store/srsStore'
import { getMasteryLevel } from '@/lib/mastery'
import { localDayStr } from '@/lib/localDate'

export const DAILY_SCOPE = '__daily__'
export const DAILY_SIZE = 10
const NEW_PER_DAY = 3

/**
 * Today's Daily 10, across every set: overdue reviews first (most overdue
 * first), up to three new words, then the weakest other cards. A brand-new
 * library with nothing to review gets new words for every slot.
 */
export function pickDailyCards(cards: Card[], srs: Record<string, CardSRS>, today: string, exclude: Set<string> = new Set(), size = DAILY_SIZE): Card[] {
  const pool = cards.filter(card => !exclude.has(card.id))
  const level = (card: Card) => getMasteryLevel(srs[card.id])
  const nextReview = (card: Card) => srs[card.id].next_review
  const due = pool.filter(card => srs[card.id] && nextReview(card) <= today)
    .sort((a, b) => nextReview(a).localeCompare(nextReview(b)) || level(a) - level(b))
  const fresh = pool.filter(card => !srs[card.id])
  const newCount = Math.min(NEW_PER_DAY, fresh.length, size)
  const picked = [...due.slice(0, size - newCount), ...fresh.slice(0, newCount)]
  const chosen = new Set(picked.map(card => card.id))
  const weakest = pool.filter(card => srs[card.id] && !chosen.has(card.id))
    .sort((a, b) => level(a) - level(b) || nextReview(a).localeCompare(nextReview(b)))
  picked.push(...weakest.slice(0, size - picked.length))
  picked.push(...fresh.slice(newCount, newCount + size - picked.length))
  return picked
}

export type DailyState = { status: 'start' } | { status: 'continue'; done: number; total: number } | { status: 'done' }

/**
 * Where today's Daily 10 stands. An unfinished round saved today resumes;
 * otherwise a recorded session with today's id means the day is done.
 * `progress` is draftProgress(draft), passed in to keep this free of the study store.
 */
export function dailyState(draft: SessionDraft | null, progress: { started: number; total: number; hasProgress: boolean } | null,
  sessionIds: string[], userId: string, today: string): DailyState {
  if (draft && progress?.hasProgress && progress.started < progress.total && localDayStr(new Date(draft.updated_at)) === today)
    return { status: 'continue', done: progress.started, total: progress.total }
  return sessionIds.includes(dailySessionId(userId, today)) ? { status: 'done' } : { status: 'start' }
}

/** Same id all day for one account, so finishing the Daily 10 on any device marks the day done */
export function dailySessionId(userId: string, day: string): string {
  const input = `memo-daily:${userId}:${day}`
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762
  for (let i = 0; i < input.length; i++) {
    const k = input.charCodeAt(i)
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067); h2 = h3 ^ Math.imul(h2 ^ k, 2869860233)
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213); h4 = h1 ^ Math.imul(h4 ^ k, 2716044179)
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067); h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233)
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213); h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179)
  h1 ^= h2 ^ h3 ^ h4; h2 ^= h1; h3 ^= h1; h4 ^= h1
  const hex = [h1, h2, h3, h4].map(h => (h >>> 0).toString(16).padStart(8, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${'89ab'[parseInt(hex[16], 16) & 3]}${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}
