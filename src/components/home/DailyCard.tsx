import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { useProgressStore } from '@/store/progressStore'
import { useStudyStore, draftProgress } from '@/store/studyStore'
import { localDayStr } from '@/lib/localDate'
import { DAILY_SCOPE, DAILY_SIZE, dailyState, firstDoneView, readDailyResult } from '@/lib/daily'
import type { SessionDraft } from '@/lib/database.types'
import styles from './DailyCard.module.css'

export default function DailyCard() {
  const userId = useAuthStore(s => s.user?.id)
  const sessionIds = useProgressStore(s => s.sessionIds)
  const dayStreak = useProgressStore(s => s.dayStreak)
  const [draft, setDraft] = useState<SessionDraft | null>(null)
  const [celebrate, setCelebrate] = useState(false)

  useEffect(() => {
    let live = true
    void useStudyStore.getState().loadProgress(DAILY_SCOPE).then(d => { if (live) setDraft(d) })
    return () => { live = false }
  }, [])

  const today = localDayStr(new Date())
  const state = userId ? dailyState(draft, draft ? draftProgress(draft) : null, sessionIds, userId, today) : null
  const done = state?.status === 'done'
  useEffect(() => { if (done && firstDoneView(today)) setCelebrate(true) }, [done, today])

  if (!userId || !state) return null

  if (state.status === 'done') {
    const result = readDailyResult(today)
    const total = result?.total ?? DAILY_SIZE
    const known = result?.known ?? total
    return (
      <section className={[styles.daily, styles.done, celebrate ? styles.celebrate : ''].join(' ')} aria-label="Daily practice, done for today">
        <div className={styles.seal} aria-hidden="true"><span>完成</span></div>
        <div className={styles.text}>
          <h2 className={styles.title}>Daily {DAILY_SIZE} · done</h2>
          <div className={styles.pips} role="img" aria-label={result ? `${known} of ${total} remembered` : 'All cards reviewed'}>
            {Array.from({ length: total }, (_, i) => (
              <span key={i} className={i < known ? styles.pipOn : styles.pipMiss} style={{ animationDelay: `${i * 60}ms` }} />
            ))}
          </div>
          <p className={styles.sub}>
            {result ? `${known} of ${total} remembered` : 'Reviewed today'}
            {dayStreak > 0 && <> · <span className={styles.streak}>{dayStreak}-day streak</span></>}
          </p>
        </div>
        <Link to="/daily?more=1" className={styles.secondary}>10 more</Link>
      </section>
    )
  }

  return (
    <section className={styles.daily} aria-label="Daily practice">
      <div className={styles.text}>
        <h2 className={styles.title}>Daily {DAILY_SIZE}</h2>
        <p className={styles.sub}>
          {state.status === 'start' && `${DAILY_SIZE} cards from all your sets · about 3 minutes`}
          {state.status === 'continue' && `${state.done} of ${state.total} done — pick up where you left off`}
        </p>
      </div>
      <Link to="/daily" className={styles.primary}>{state.status === 'start' ? 'Start' : 'Continue'}</Link>
    </section>
  )
}
