import { stableId } from './stableId'
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
  return stableId(`memo-daily:${userId}:${day}`)
}

const resultKey = 'memo-daily-result'
const celebratedKey = 'memo-daily-celebrated'

/** Today's score, kept on this device so Home can show it; other devices just show the day as done */
export function saveDailyResult(day: string, known: number, total: number) {
  try { localStorage.setItem(resultKey, JSON.stringify({ day, known, total })) } catch { /* Home falls back to a plain done state. */ }
}
export function readDailyResult(day: string): { known: number; total: number } | null {
  try {
    const r = JSON.parse(localStorage.getItem(resultKey) ?? 'null')
    return r?.day === day && Number.isInteger(r.known) && Number.isInteger(r.total) && r.total > 0 ? { known: r.known, total: r.total } : null
  } catch { return null }
}
/** True only the first time Home shows today's finished round, so the stamp animates once */
export function firstDoneView(day: string): boolean {
  try {
    if (localStorage.getItem(celebratedKey) === day) return false
    localStorage.setItem(celebratedKey, day)
    return true
  } catch { return false }
}
