import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from './authStore'

interface ProgressState {
  weekStreak: number
  dayStreak: number
  studiedDays: string[]          // local 'YYYY-MM-DD' strings with ≥1 session
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

type SessionRow = { completed_at: string; total_cards: number }

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

// Local calendar day 'YYYY-MM-DD' — uses the user's timezone, since "studied
// today" should follow their clock, not UTC
export function localDayStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
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
  totalCardsStudied: 0,
  isLoading: false,
  progressLastFetched: 0,

  fetchProgress: async (force = false) => {
    // Skip refetch if data is fresh (< 60s old) — unless forced,
    // e.g. right after a session save so new stats show immediately
    if (!force && Date.now() - get().progressLastFetched < 60_000) return
    set({ isLoading: true })
    const user = useAuthStore.getState().user
    if (!user) { set({ isLoading: false }); return }

    const { data: sessions, error } = await supabase
      .from('study_sessions')
      .select('completed_at, total_cards')
      .eq('user_id', user.id)
      .order('completed_at', { ascending: false })

    if (error) { console.error('fetchProgress error:', error.message); set({ isLoading: false }); return }

    const s = sessions ?? []
    const totalCardsStudied = s.reduce((acc, sess) => acc + sess.total_cards, 0)
    const weekStreak = calculateWeekStreak(s)
    const daySet = new Set(s.map((sess) => localDayStr(new Date(sess.completed_at))))
    const dayStreak = calculateDayStreak(daySet)

    set({ weekStreak, dayStreak, studiedDays: Array.from(daySet), totalCardsStudied, isLoading: false, progressLastFetched: Date.now() })
  },
}))
