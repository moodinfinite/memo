import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { StudySession } from '@/lib/database.types'

interface ProgressState {
  sessions: StudySession[]
  weekStreak: number
  totalCardsStudied: number
  isLoading: boolean
  fetchProgress: () => Promise<void>
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
  const jan4 = new Date(Date.UTC(utc.getUTCFullYear(), 0, 4))
  const dayOfWeek = jan4.getUTCDay() || 7
  const week1Monday = jan4.getTime() - (dayOfWeek - 1) * 86400000
  const weekNum = Math.floor((utc.getTime() - week1Monday) / (7 * 86400000)) + 1
  return `${utc.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`
}

function calculateWeekStreak(sessions: StudySession[]): number {
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

export const useProgressStore = create<ProgressState>((set) => ({
  sessions: [],
  weekStreak: 0,
  totalCardsStudied: 0,
  isLoading: false,

  fetchProgress: async () => {
    set({ isLoading: true })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { set({ isLoading: false }); return }

    const { data: sessions } = await supabase
      .from('study_sessions')
      .select('*')
      .eq('user_id', user.id)
      .order('completed_at', { ascending: false })
      .limit(200)

    const s = sessions ?? []
    const totalCardsStudied = s.reduce((acc, sess) => acc + sess.total_cards, 0)
    const weekStreak = calculateWeekStreak(s)

    set({ sessions: s, weekStreak, totalCardsStudied, isLoading: false })
  },
}))
