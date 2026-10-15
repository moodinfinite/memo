export type CalendarView = 'week' | 'month'

export function calendarDayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** Local dates at noon keep calendar arithmetic stable across DST changes. */
export function calendarDays(today: Date, view: CalendarView): (Date | null)[] {
  const year = today.getFullYear(), month = today.getMonth()
  if (view === 'week') {
    const monday = today.getDate() - (today.getDay() + 6) % 7
    return Array.from({ length: 7 }, (_, i) => new Date(year, month, monday + i, 12))
  }
  const offset = (new Date(year, month, 1, 12).getDay() + 6) % 7
  const count = new Date(year, month + 1, 0, 12).getDate()
  return [...Array<null>(offset).fill(null), ...Array.from({ length: count }, (_, i) => new Date(year, month, i + 1, 12))]
}

/** Yesterday's streak remains active until today ends. */
export function calendarStreak(studiedDays: string[], today: Date): number {
  const studied = new Set(studiedDays)
  const cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12)
  if (!studied.has(calendarDayKey(cursor))) cursor.setDate(cursor.getDate() - 1)
  let streak = 0
  while (studied.has(calendarDayKey(cursor))) {
    streak++
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}
