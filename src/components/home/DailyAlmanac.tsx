import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { calendarDayKey, calendarDays, calendarStreak, type CalendarView } from '@/lib/calendar'
import styles from './DailyAlmanac.module.css'

const preferenceKey = 'memo-calendar-view'
const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const chineseWeekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
const chineseMonths = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月']
const shortChineseWeekdays = ['週一', '週二', '週三', '週四', '週五', '週六', '週日']

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
  const days = calendarDays(today, view)
  const periodTotal = days.filter(date => date && calendarDayKey(date) <= todayKey && studied.has(calendarDayKey(date))).length
  const paddedDays = [...days, ...Array<null>((7 - days.length % 7) % 7).fill(null)]
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
        <div className={styles.monthBand}><span>{monthName} <span lang="zh-Hant">{chineseMonths[today.getMonth()]}</span></span><span>{today.getFullYear()}</span></div>
        <time dateTime={todayKey} aria-label={dateLabel}>
          <span className={styles.chinese} lang="zh-Hant" aria-hidden="true">{chineseWeekdays[today.getDay()]}</span>
          <span className={styles.date}>{today.getDate()}</span>
          <span className={styles.weekday} aria-hidden="true">{weekday}</span>
        </time>
      </div>
      <div className={styles.activity}>
        <div className={styles.activityHeader}>
          <p className={styles.period} aria-live="polite">{period}</p>
          <div className={styles.toggle} role="group" aria-label="Calendar view">
            <button type="button" aria-pressed={view === 'week'} onClick={() => selectView('week')}>Week</button>
            <button type="button" aria-pressed={view === 'month'} onClick={() => selectView('month')}>Month</button>
          </div>
        </div>
        <div className={`${styles.grid} ${view === 'month' ? styles.monthGrid : ''}`} role="list" aria-label={`${view === 'week' ? 'This week' : 'This month'} study activity`}>
          {weekdays.map((day, index) => <span key={day} className={`${styles.dayHeading} ${index > 4 ? styles.weekendHeading : ''}`} aria-hidden="true"><b>{day[0]}</b><span lang="zh-Hant">{shortChineseWeekdays[index]}</span></span>)}
          {paddedDays.map((date, index) => {
            if (!date) return <span key={`blank-${index}`} className={styles.day} aria-hidden="true" />
            const key = calendarDayKey(date), isToday = key === todayKey
            const isStudied = ready && key <= todayKey && studied.has(key)
            const future = key > todayKey
            const label = `${date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}${isToday ? ', today' : ''}, ${future ? 'upcoming' : !ready ? 'history loading' : isStudied ? 'studied' : 'no study session'}`
            return <div key={key} role="listitem" aria-label={label} aria-current={isToday ? 'date' : undefined}
              className={[styles.day, isStudied ? styles.studied : '', isToday ? styles.today : '', future ? styles.future : ''].join(' ')}>
              <span className={styles.dayNumber} aria-hidden="true">{date.getDate()}</span>
            </div>
          })}
        </div>
      </div>
    </div>
    <div className={styles.totals} aria-live="polite">
      <div className={styles.streak}><strong>{ready ? streak : '—'}</strong><span>Day streak</span></div>
      <div aria-label={ready ? `${periodTotal} days studied this ${view}` : 'Loading study history'}><strong>{ready ? periodTotal : '—'}</strong><span>Days this {view}</span></div>
    </div>
  </section>
}
