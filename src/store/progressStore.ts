import { readAllRows } from '@/lib/readAllRows'
import { localDayStr } from '@/lib/localDate'
export { localDayStr } from '@/lib/localDate'
import { onSynced, pendingWrites, readLocal, writeLocal } from '@/lib/sync'
import { registerAccountReset } from '@/lib/accountState'
import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from './authStore'

interface ProgressState {
  weekStreak: number
  dayStreak: number
  studiedDays: string[]          // local 'YYYY-MM-DD' strings with ≥1 session
  sessionIds: string[]           // recorded sessions with answers, including ones still waiting to sync
  totalCardsStudied: number
  isLoading: boolean
  progressLastFetched: number
  fetchProgress: (force?: boolean) => Promise<void>
}

/**
 * Streak = number of consecutive calendar weeks with at least one study session.
 * A "week" is Mon–Sun (ISO 8601). Current week counts if already studied this week.
 */

// Returns the timestamp (ms) of Monday 00:00 UTC for an ISO week string "YYYY-Www"
function getMondayMs(weekStr: string): number {
  const [year, week] = weekStr.split('-W').map(Number)
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const dayOfWeek = jan4.getUTCDay() || 7  // Mon=1 … Sun=7
  const week1Monday = jan4.getTime() - (dayOfWeek - 1) * 86400000
  return week1Monday + (week - 1) * 7 * 86400000
}

function toISOWeekStr(d: Date): string {
  // Shift to UTC noon to avoid DST edge cases
  const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 12))
  const year = utc.getUTCFullYear()

  const computeWeekNum = (y: number) => {
    const jan4 = new Date(Date.UTC(y, 0, 4))
    const dayOfWeek = jan4.getUTCDay() || 7
    const week1Monday = jan4.getTime() - (dayOfWeek - 1) * 86400000
    return Math.floor((utc.getTime() - week1Monday) / (7 * 86400000)) + 1
  }

  let weekYear = year
  let weekNum = computeWeekNum(year)

  // Dec 28–31 can belong to week 1 of the next ISO year
  if (weekNum >= 53) {
    const nextWeekNum = computeWeekNum(year + 1)
    if (nextWeekNum >= 1) { weekYear = year + 1; weekNum = nextWeekNum }
  }
  // Jan 1–3 can belong to week 52/53 of the prior ISO year
  if (weekNum < 1) {
    weekYear = year - 1
    weekNum = computeWeekNum(year - 1)
  }

  return `${weekYear}-W${String(weekNum).padStart(2, '0')}`
}

type SessionRow = { id: string; completed_at: string; total_cards: number }
let fetchSequence = 0

function calculateWeekStreak(sessions: SessionRow[]): number {
  if (sessions.length === 0) return 0

  const weekSet = new Set(sessions.map((s) => toISOWeekStr(new Date(s.completed_at))))
  const weeks = Array.from(weekSet).sort().reverse()

  const currentWeek = toISOWeekStr(new Date())
  const lastWeek = toISOWeekStr(new Date(Date.now() - 7 * 86400000))

  // Streak must start from current or last week
  if (weeks[0] !== currentWeek && weeks[0] !== lastWeek) return 0

  let streak = 1
  for (let i = 1; i < weeks.length; i++) {
    const diffDays = Math.round((getMondayMs(weeks[i - 1]) - getMondayMs(weeks[i])) / 86400000)
    if (diffDays !== 7) break
    streak++
  }

  return streak
}

/**
 * Day streak = consecutive local calendar days with at least one session.
 * Today counts if already studied today; otherwise the streak is still alive
 * if yesterday was studied (you haven't "missed" today until it's over).
 */
function calculateDayStreak(studiedDays: Set<string>): number {
  if (studiedDays.size === 0) return 0
  const cursor = new Date()
  if (!studiedDays.has(localDayStr(cursor))) {
    cursor.setDate(cursor.getDate() - 1)
    if (!studiedDays.has(localDayStr(cursor))) return 0
  }
  let streak = 0
  while (studiedDays.has(localDayStr(cursor))) {
    streak++
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

export const useProgressStore = create<ProgressState>((set, get) => ({
  weekStreak: 0,
  dayStreak: 0,
  studiedDays: [],
  sessionIds: [],
  totalCardsStudied: 0,
  isLoading: false,
  progressLastFetched: 0,

  fetchProgress: async (force = false) => {
    // Skip refetch if data is fresh (< 60s old) — unless forced,
    // e.g. right after a session save so new stats show immediately
    set({ isLoading: true })
    const user = useAuthStore.getState().user
    if (!user) { set({ isLoading: false }); return }

    const cacheKey = `memo:activity:${user.id}`
    const apply = (rows: SessionRow[]) => {
      const map = new Map(rows.map(row => [row.id, row]))
      for (const job of pendingWrites(user.id)) {
        if (job.table !== 'study_sessions') continue
        if (job.operation === 'upsert') map.set(job.data!.id as string, job.data as unknown as SessionRow)
        else map.delete(job.filters!.id)
      }
      const s = [...map.values()].filter(row => row.total_cards > 0)
      const daySet = new Set(s.map(row => localDayStr(new Date(row.completed_at))))
      set({ weekStreak: calculateWeekStreak(s), dayStreak: calculateDayStreak(daySet),
        studiedDays: [...daySet], sessionIds: s.map(row => row.id), totalCardsStudied: s.reduce((sum, row) => sum + row.total_cards, 0) })
    }
    apply(readLocal<SessionRow[]>(cacheKey) ?? [])
    if (!force && Date.now() - get().progressLastFetched < 60_000) { set({ isLoading: false }); return }
    const sequence = ++fetchSequence
    const { data: sessions, error } = await readAllRows<SessionRow>((from, to, signal) => supabase
      .from('study_sessions').select('id, completed_at, total_cards').eq('user_id', user.id)
      .order('id').range(from, to).abortSignal(signal))
    if (useAuthStore.getState().user?.id !== user.id || sequence !== fetchSequence) return
    if (error) { set({ isLoading: false }); return }
    writeLocal(cacheKey, sessions)
    apply(sessions ?? [])
    set({ isLoading: false, progressLastFetched: Date.now() })
  },
}))

registerAccountReset(() => { fetchSequence++; useProgressStore.setState(useProgressStore.getInitialState(), true) })

onSynced(job => { if (job.table === 'study_sessions') void useProgressStore.getState().fetchProgress(true) })
