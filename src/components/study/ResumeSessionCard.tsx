import type { SessionDraft } from '@/lib/database.types'
import { draftProgress } from '@/store/studyStore'
import styles from '@/pages/StudyPage.module.css'

const modeNames = { flashcard: 'Flashcards', learn: 'Learn', multiple_choice: 'Multiple choice', typed: 'Typed answer', sentence: 'Write a sentence' }

export default function ResumeSessionCard({ draft, busy, onResume, onChoose }: {
  draft: SessionDraft
  busy: boolean
  onResume: () => void
  onChoose: () => void
}) {
  const { done, started, total } = draftProgress(draft)
  return <section className={styles.resumePrompt} aria-label="Saved study session">
    <h2 className={styles.resumeTitle}>Continue {modeNames[draft.mode]}?</h2>
    <p className={styles.resumeMeta}>{done} of {total} cards {draft.mode === 'learn' ? 'practised' : 'reviewed'}
      {draft.mode === 'learn' && started > done && ` · ${started - done} in progress`}</p>
    <progress className={styles.resumeProgress} aria-label="Completed cards" value={done} max={Math.max(total, 1)} />
    <div className={styles.resumeActions}>
      <button type="button" className={styles.startBtn} onClick={onResume} disabled={busy}>{busy ? 'Loading…' : 'Resume session'}</button>
      <button type="button" className={styles.changeModeBtn} onClick={onChoose} disabled={busy}>Choose a new session</button>
    </div>
  </section>
}
