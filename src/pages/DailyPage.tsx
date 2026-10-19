import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { useStudyStore, draftProgress } from '@/store/studyStore'
import { useSRSStore } from '@/store/srsStore'
import { useProgressStore } from '@/store/progressStore'
import { localDayStr } from '@/lib/localDate'
import { DAILY_SCOPE, dailySessionId, dailyState, pickDailyCards } from '@/lib/daily'
import type { Card } from '@/lib/database.types'
import FlashCard from '@/components/cards/FlashCard'
import MasteryChange from '@/components/study/MasteryChange'
import { CountUpScore, PerfectScore } from './StudyPage'
import { StudyPageSkeleton } from '@/components/ui/Skeleton'
import styles from './StudyPage.module.css'
import dStyles from './DailyPage.module.css'

type Phase = 'loading' | 'studying' | 'done-already' | 'empty' | 'error'

export default function DailyPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { sessionCards, currentIndex, isComplete, known, unknown, markKnown, markUnknown,
    startSession, resumeSession, loadProgress, clearProgress, persistSession } = useStudyStore()
  const dayStreak = useProgressStore(s => s.dayStreak)
  const [phase, setPhase] = useState<Phase>('loading')
  const [allCards, setAllCards] = useState<Card[]>([])
  const [flipKey, setFlipKey] = useState(0)

  // English first, recall the Chinese: retrieval is what makes the review stick.
  // Extra rounds (no fixed sessionId) skip cards already reviewed today, unless nothing else is left.
  const startRound = (cards: Card[], sessionId?: string, exclude: Set<string> = new Set()) => {
    const srs = useSRSStore.getState().cardSRS, today = localDayStr(new Date())
    const reviewedToday = sessionId ? [] : cards.filter(card => srs[card.id] && localDayStr(new Date(srs[card.id].last_seen_at)) === today).map(card => card.id)
    let picks = pickDailyCards(cards, srs, today, new Set([...exclude, ...reviewedToday]))
    if (!picks.length) picks = pickDailyCards(cards, srs, today, exclude)
    if (!picks.length) { setPhase('empty'); return }
    startSession(picks, 'flashcard', DAILY_SCOPE, { shuffle: true, sessionId })
    setPhase('studying')
  }

  const begin = async () => {
    const user = useAuthStore.getState().user
    if (!user) return
    setPhase('loading')
    const [{ data, error }] = await Promise.all([
      supabase.from('cards').select('*').order('set_id'),
      useSRSStore.getState().fetchAllSRS(),
      useProgressStore.getState().fetchProgress(),
    ])
    if (error) { setPhase('error'); return }
    const cards = (data ?? []) as Card[]
    setAllCards(cards)
    const today = localDayStr(new Date())
    const draft = await loadProgress(DAILY_SCOPE)
    const state = dailyState(draft, draft ? draftProgress(draft) : null, useProgressStore.getState().sessionIds, user.id, today)
    if (state.status === 'continue' && draft) {
      resumeSession(draft, cards)
      if (useStudyStore.getState().sessionCards.length) { setPhase('studying'); return }
    }
    if (draft) void clearProgress(DAILY_SCOPE)
    if (state.status === 'done') {
      if (params.has('more')) startRound(cards)
      else setPhase('done-already')
      return
    }
    startRound(cards, dailySessionId(user.id, today))
  }

  useEffect(() => {
    void begin()
    return () => useStudyStore.getState().resetSession()
  }, [])

  useEffect(() => { setFlipKey(0) }, [currentIndex])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (useStudyStore.getState().editingCard) return
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return
      if (phase !== 'studying' || isComplete) return
      if (e.code === 'Space') { e.preventDefault(); setFlipKey(k => k + 1) }
      if (e.code === 'ArrowLeft') { e.preventDefault(); markUnknown() }
      if (e.code === 'ArrowRight') { e.preventDefault(); markKnown() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [phase, isComplete])

  const leave = () => {
    if (phase === 'studying' && !isComplete) persistSession()
    navigate('/')
  }
  const tenMore = () => startRound(allCards, undefined, new Set(sessionCards.map(card => card.id)))

  if (phase === 'loading') return <StudyPageSkeleton />

  if (phase === 'error') return (
    <div className={dStyles.message}>
      <p>Couldn't load your cards.</p>
      <button className={styles.retryBtn} onClick={() => void begin()}>Try again</button>
    </div>
  )

  if (phase === 'empty') return (
    <div className={dStyles.message}>
      <div className={dStyles.eyebrow}>Daily 10</div>
      <p>Nothing to practise yet — add a set and your daily cards will appear here.</p>
      <Link to="/sets/new" className={`${styles.retryBtn} ${dStyles.linkBtn}`}>Create a set</Link>
    </div>
  )

  if (phase === 'done-already') return (
    <div className={styles.page}>
      <div className={styles.summaryWrap}>
        <div className={styles.summary}>
          <div className={dStyles.eyebrow}>Daily 10</div>
          <div className={styles.summaryTitle}>Done for today ✓</div>
          {dayStreak > 0 && <div className={dStyles.streak}>🔥 {dayStreak}-day streak</div>}
          <p className={dStyles.note}>Come back tomorrow for a new 10. Want more now?</p>
          <div className={styles.summaryActions}>
            <button className={styles.retryBtn} onClick={tenMore}>10 more</button>
            <Link to="/" className={styles.doneBtn}>Back to Home</Link>
          </div>
        </div>
      </div>
    </div>
  )

  if (isComplete) {
    const total = known.length + unknown.length
    const pct = total ? Math.round(known.length / total * 100) : 0
    return (
      <div className={styles.page}>
        <div className={styles.summaryWrap}>
          <div className={styles.summary}>
            <div className={dStyles.eyebrow}>Daily 10 · done</div>
            {pct === 100
              ? <PerfectScore total={total} known={known.length} unknown={unknown.length} />
              : <CountUpScore pct={pct} total={total} known={known.length} unknown={unknown.length} />}
            {dayStreak > 0 && <div className={dStyles.streak}>🔥 {dayStreak}-day streak</div>}
            <MasteryChange cards={sessionCards} label="Mastery of today's cards" />
            <div className={styles.summaryActions}>
              <Link to="/" className={`${styles.retryBtn} ${dStyles.linkBtn}`}>Back to Home</Link>
              <button className={styles.changeModeBtn} onClick={tenMore}>10 more</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const card = sessionCards[currentIndex]
  if (!card) return <StudyPageSkeleton />

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={leave}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M10 3L5 8l5 5"/></svg>
          Home
        </button>
        <div className={dStyles.eyebrow}>Daily 10</div>
      </div>
      <div className={styles.progressRow}>
        <div className={styles.progressTrack}><div className={styles.progressFill} style={{ width: `${(currentIndex / sessionCards.length) * 100}%` }} /></div>
        <span className={styles.progressLabel}>{currentIndex + 1} / {sessionCards.length}</span>
      </div>
      <p className={dStyles.prompt}>Recall the Chinese, then flip to check.</p>
      <FlashCard key={card.id} card={card} index={currentIndex} total={sessionCards.length}
        onKnow={markKnown} onDontKnow={markUnknown} flipKey={flipKey} startSide="definition" />
      <div className={styles.kbdHint}>
        <span className={styles.kbd}><kbd>Space</kbd> flip</span>
        <span className={styles.kbd}><kbd>←</kbd> still learning</span>
        <span className={styles.kbd}><kbd>→</kbd> got it</span>
      </div>
    </div>
  )
}
