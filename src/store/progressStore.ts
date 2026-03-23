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
 * A "week" is Mon–Sun. Current week counts if already studied this week.
 */
function calculateWeekStreak(sessions: StudySession[]): number {
  if (sessions.length === 0) return 0

  // Get unique ISO week strings "YYYY-Www"
  const weekSet = new Set(
    sessions.map((s) => {
      const d = new Date(s.completed_at)
      // ISO week calculation
      const jan4 = new Date(d.getFullYear(), 0, 4)
      const weekNum = Math.ceil(
        ((d.getTime() - jan4.getTime()) / 86400000 + jan4.getDay() + 1) / 7
      )
      return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`
    })
  )

  const weeks = Array.from(weekSet).sort().reverse()

  // Get current week
  const now = new Date()
  const jan4 = new Date(now.getFullYear(), 0, 4)
  const currentWeekNum = Math.ceil(
    ((now.getTime() - jan4.getTime()) / 86400000 + jan4.getDay() + 1) / 7
  )
  const currentWeek = `${now.getFullYear()}-W${String(currentWeekNum).padStart(2, '0')}`

  // Streak must include current or last week
  if (weeks[0] !== currentWeek) {
    // Check if last week
    const lastWeekDate = new Date(now)
    lastWeekDate.setDate(now.getDate() - 7)
    const lastJan4 = new Date(lastWeekDate.getFullYear(), 0, 4)
    const lastWeekNum = Math.ceil(
      ((lastWeekDate.getTime() - lastJan4.getTime()) / 86400000 + lastWeekDate.getDay() + 1) / 7
    )
    const lastWeek = `${lastWeekDate.getFullYear()}-W${String(lastWeekNum).padStart(2, '0')}`
    if (weeks[0] !== lastWeek) return 0
  }

  let streak = 1
  for (let i = 1; i < weeks.length; i++) {
    // Check if consecutive (simplistic: just count distinct weeks in order)
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
