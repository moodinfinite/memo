import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { calendarDayKey, calendarDays, calendarStreak, type CalendarView } from '@/lib/calendar'
import styles from './DailyAlmanac.module.css'

const preferenceKey = 'memo-calendar-view'
const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const chineseWeekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']

export default function DailyAlmanac({ firstName, studiedDays, ready }: { firstName: string; studiedDays: string[]; ready: boolean }) {
  const [today, setToday] = useState(() => new Date())
  const [view, setView] = useState<CalendarView>(() => {
    try { return localStorage.getItem(preferenceKey) === 'month' ? 'month' : 'week' }
    catch { return 'week' }
  })

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const refresh = () => {
      clearTimeout(timer)
      const now = new Date()
      setToday(now)
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
      timer = setTimeout(refresh, midnight.getTime() - now.getTime() + 100)
    }
    refresh()
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])

  const selectView = (next: CalendarView) => {
    setView(next)
    try { localStorage.setItem(preferenceKey, next) } catch { /* View still works without device storage. */ }
  }
  const greeting = today.getHours() < 12 ? 'Good morning' : today.getHours() < 17 ? 'Good afternoon' : 'Good evening'
  const todayKey = calendarDayKey(today)
  const studied = new Set(studiedDays)
  const streak = calendarStreak(studiedDays, today)
  const studiedToday = studied.has(todayKey)
  const days = calendarDays(today, view)
  const monthName = today.toLocaleDateString('en-US', { month: 'long' })
  const weekday = today.toLocaleDateString('en-US', { weekday: 'long' })
  const dateLabel = today.toLocaleDateString('en-US', { dateStyle: 'full' })
  const shortDate = (date: Date) => date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  const period = view === 'month' ? `${monthName} ${today.getFullYear()}`
    : `${shortDate(days[0]!)} – ${shortDate(days[6]!)}${days[0]!.getFullYear() !== days[6]!.getFullYear() ? ` · ${days[0]!.getFullYear()}/${days[6]!.getFullYear()}` : ''}`

  return <section className={styles.calendar} aria-label="Your study calendar">
    <div className={styles.binding}>
      <h1 className={styles.greeting}>{greeting}, {firstName}</h1>
      <Link to="/sets/new" className={styles.newSet}><span aria-hidden="true">＋</span> New set</Link>
    </div>
    <div className={styles.body}>
      <div className={styles.dateLeaf}>
        <time dateTime={todayKey} aria-label={dateLabel}>
          <span className={styles.month}>{monthName}</span>
          <span className={styles.date}>{today.getDate()}</span>
          <span className={styles.chinese} lang="zh-Hant" aria-hidden="true">{chineseWeekdays[today.getDay()]}</span>
          <span className={styles.weekday} aria-hidden="true">{weekday}</span>
        </time>
        <div className={styles.streak} aria-live="polite">
          <strong>{ready ? streak : '—'}</strong>
          <div><span className={styles.streakLabel}>Day streak</span><span className={styles.streakHint}>{!ready ? 'Loading study history…' : studiedToday ? 'Today, counted ✓' : streak > 0 ? 'Study today to keep it' : 'A new streak starts today'}</span></div>
        </div>
      </div>
      <div className={styles.activity}>
        <div className={styles.activityHeader}>
          <h2>Your rhythm</h2>
          <div className={styles.toggle} role="group" aria-label="Calendar view">
            <button type="button" aria-pressed={view === 'week'} onClick={() => selectView('week')}>Week</button>
            <button type="button" aria-pressed={view === 'month'} onClick={() => selectView('month')}>Month</button>
          </div>
        </div>
        <p className={styles.period} aria-live="polite">{period}</p>
        <div className={styles.grid} role="list" aria-label={`${view === 'week' ? 'This week' : 'This month'} study activity`}>
          {weekdays.map(day => <span key={day} className={styles.dayHeading} aria-hidden="true">{day.slice(0, 3)}</span>)}
          {days.map((date, index) => {
            if (!date) return <span key={`blank-${index}`} aria-hidden="true" />
            const key = calendarDayKey(date), isToday = key === todayKey
            const isStudied = ready && key <= todayKey && studied.has(key)
            const future = key > todayKey
            const label = `${date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}${isToday ? ', today' : ''}, ${future ? 'upcoming' : !ready ? 'history loading' : isStudied ? 'studied' : 'no study session'}`
            return <div key={key} role="listitem" aria-label={label} aria-current={isToday ? 'date' : undefined}
              className={[styles.day, isStudied ? styles.studied : '', isToday ? styles.today : '', future ? styles.future : ''].join(' ')}>
              <span aria-hidden="true">{date.getDate()}</span><span className={styles.mark} aria-hidden="true">{isStudied ? '✓' : future ? '' : '·'}</span>
            </div>
          })}
        </div>
        <div className={styles.legend}><span>✓ Studied</span><span>Today: {shortDate(today)}</span></div>
      </div>
    </div>
    <div className={styles.footer}><span lang="zh-Hant">一日一點進步</span><span>A little progress, every day.</span></div>
  </section>
}
