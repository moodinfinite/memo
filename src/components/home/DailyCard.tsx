import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { useProgressStore } from '@/store/progressStore'
import { useStudyStore, draftProgress } from '@/store/studyStore'
import { localDayStr } from '@/lib/localDate'
import { DAILY_SCOPE, DAILY_SIZE, dailyState } from '@/lib/daily'
import type { SessionDraft } from '@/lib/database.types'
import styles from './DailyCard.module.css'

export default function DailyCard() {
  const userId = useAuthStore(s => s.user?.id)
  const sessionIds = useProgressStore(s => s.sessionIds)
  const [draft, setDraft] = useState<SessionDraft | null>(null)

  useEffect(() => {
    let live = true
    void useStudyStore.getState().loadProgress(DAILY_SCOPE).then(d => { if (live) setDraft(d) })
    return () => { live = false }
  }, [])

  if (!userId) return null
  const state = dailyState(draft, draft ? draftProgress(draft) : null, sessionIds, userId, localDayStr(new Date()))

  return (
    <section className={[styles.daily, state.status === 'done' ? styles.done : ''].join(' ')} aria-label="Daily practice">
      <div className={styles.text}>
        <h2 className={styles.title}>Daily {DAILY_SIZE}</h2>
        <p className={styles.sub}>
          {state.status === 'start' && `${DAILY_SIZE} cards from all your sets · about 3 minutes`}
          {state.status === 'continue' && `${state.done} of ${state.total} done — pick up where you left off`}
          {state.status === 'done' && 'Done for today ✓ Come back tomorrow for a new 10'}
        </p>
      </div>
      <Link to={state.status === 'done' ? '/daily?more=1' : '/daily'} className={state.status === 'done' ? styles.secondary : styles.primary}>
        {state.status === 'start' ? 'Start' : state.status === 'continue' ? 'Continue' : '10 more'}
      </Link>
    </section>
  )
}
