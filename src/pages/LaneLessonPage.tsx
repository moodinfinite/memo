import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import FlashCard from '@/components/cards/FlashCard'
import { StudyPageSkeleton } from '@/components/ui/Skeleton'
import { supabase } from '@/lib/supabase'
import type { Card } from '@/lib/database.types'
import { readAllRows } from '@/lib/readAllRows'
import { loadWordList } from '@/lib/levelTest'
import { laneCardId, lanePracticeId, laneSetId, planLaneLesson } from '@/lib/lane'
import { pendingWrites } from '@/lib/sync'
import { localDayStr } from '@/lib/localDate'
import { useAuthStore } from '@/store/authStore'
import { useSetsStore } from '@/store/setsStore'
import { useSRSStore } from '@/store/srsStore'
import { useStudyStore } from '@/store/studyStore'
import styles from './StudyPage.module.css'
import lesson from './DailyPage.module.css'

type Phase = 'loading' | 'study' | 'done-today' | 'waiting' | 'complete' | 'error'

export default function LaneLessonPage() {
  const userId = useAuthStore(s => s.user?.id)
  const [phase, setPhase] = useState<Phase>('loading')
  const [attempt, setAttempt] = useState(0)
  const { sessionCards, currentIndex, isComplete, known, masteryBefore, markKnown, markUnknown } = useStudyStore()
  useEffect(() => {
    let active = true
    const current = () => active && useAuthStore.getState().user?.id === userId
    async function openLesson() {
      if (!userId) return
      setPhase('loading')
      const setId = laneSetId(userId)
      const today = localDayStr(new Date())
      const sessionId = lanePracticeId(userId, today)
      const [list, rows, draft, recorded] = await Promise.all([
        loadWordList(),
        readAllRows<Card>((from, to, signal) => supabase.from('cards').select('*').eq('user_id', userId)
          .order('id').range(from, to).abortSignal(signal)),
        useStudyStore.getState().loadProgress(setId),
        supabase.from('study_sessions').select('completed_at').eq('user_id', userId).eq('set_id', setId)
          .order('completed_at', { ascending: false }).limit(1).maybeSingle(),
        useSRSStore.getState().fetchAllSRS(),
      ])
      if (!current()) return
      if (!list.length || !rows.data || !useSRSStore.getState().srsAllFetchedAt) throw new Error('Path unavailable')
      const cards = rows.data
      // A partially answered session also has a history row. Its draft takes precedence.
      const keepDraft = draft && (draft.current_index > 0 || localDayStr(new Date(draft.updated_at)) === today)
      if (keepDraft && draft.mode === 'flashcard' && draft.card_order.some(id => cards.some(c => c.id === id))) {
        useStudyStore.getState().resumeSession(draft, cards)
        setPhase('study')
        return
      }
      const savedToday = (date: unknown) => typeof date === 'string' && localDayStr(new Date(date)) === today
      const awaitingSync = pendingWrites(userId).some(write => write.table === 'study_sessions' &&
        write.data?.set_id === setId && savedToday(write.data.completed_at))
      if (savedToday(recorded.data?.completed_at) || awaitingSync) { setPhase('done-today'); return }
      if (recorded.error) throw recorded.error
      const { picks, complete } = planLaneLesson<Card>(list, cards, useSRSStore.getState().cardSRS, today, setId)
      if (!picks.length) { setPhase(complete ? 'complete' : 'waiting'); return }

      const { error: setError } = await supabase.from('sets').upsert({
        id: setId, user_id: userId, title: 'The Lane · TOCFL Level 3',
        description: 'Words introduced on the Taiwan vocabulary path. Meanings draw on CC-CEDICT (CC BY-SA 4.0) and Memo glosses.',
      }, { onConflict: 'id', ignoreDuplicates: true })
      if (!current()) return
      if (setError) throw setError
      const round = picks.map(({ word, meaning, position, card }) => card ?? {
        id: laneCardId(setId, word.forms[0]), set_id: setId, user_id: userId, position,
        term: word.forms[0], definition: `(${word.pinyin}) ${meaning.replace(/;\s*/g, ', ')}`,
      })
      const missing = round.filter((_, i) => !picks[i].card)
      if (missing.length) {
        const { error } = await supabase.from('cards').upsert(missing, { onConflict: 'id', ignoreDuplicates: true })
        if (!current()) return
        if (error) throw error
      }
      useSetsStore.setState({ setsLastFetched: 0, currentSetFetchedAt: 0 })
      useStudyStore.getState().startSession(round, 'flashcard', setId, { sessionId })
      setPhase('study')
    }
    void openLesson().catch(() => { if (current()) setPhase('error') })
    return () => { active = false; useStudyStore.getState().resetSession() }
  }, [userId, attempt])

  if (phase === 'loading') return <StudyPageSkeleton />
  const card = sessionCards[currentIndex]
  if (phase !== 'study' || isComplete || !card) {
    const message = phase === 'complete' ? 'Every Level 3 word is Familiar. Your alley is fully lit.'
      : phase === 'done-today' ? 'Today’s practice is complete. Your next practice will be ready tomorrow.'
      : phase === 'waiting' ? 'You’ve started every remaining word. Come back when your next reviews are due.'
      : phase === 'error' ? 'Your path couldn’t load. Try again when connected.'
      : `You remembered ${known.length} of ${sessionCards.length} words in today’s practice. Pick one to use in a phrase.`
    return <section className={lesson.message}>
      <h1 className={styles.resumeTitle}>Taiwan path · Level 3</h1><p>{message}</p>
      {phase === 'error' && <button className={styles.startBtn} onClick={() => setAttempt(n => n + 1)}>Try again</button>}
      <Link className={styles.doneBtn} to="/?view=lane">Back to the alley</Link>
    </section>
  }
  const reviews = masteryBefore && sessionCards.filter(word => (masteryBefore[word.id] ?? 0) > 0).length
  return <section className={styles.page}>
    <div className={styles.topBar}>
      <Link className={styles.backBtn} to="/?view=lane">← The Lane</Link>
      <h1 className={styles.resumeTitle}>Taiwan path · Level 3</h1>
    </div>
    {reviews != null && <p className={lesson.note}>Today’s practice · {[
      reviews > 0 && `${reviews} review${reviews === 1 ? '' : 's'}`,
      sessionCards.length > reviews && `${sessionCards.length - reviews} new`,
    ].filter(Boolean).join(' · ')}</p>}
    <div className={styles.progressRow}>
      <progress className={styles.resumeProgress} aria-label="Lesson progress" value={currentIndex} max={sessionCards.length} />
      <span className={styles.progressLabel}>{currentIndex + 1} / {sessionCards.length}</span>
    </div>
    <FlashCard key={card.id} card={card} index={currentIndex} total={sessionCards.length} onKnow={markKnown} onDontKnow={markUnknown} />
  </section>
}
