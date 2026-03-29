import type { SentenceEntry } from '@/lib/database.types'
import { exportSentencesToExcel } from '@/lib/exportSentences'
import styles from './SentenceSummary.module.css'

interface Props {
  entries: SentenceEntry[]
  setTitle: string
  isPersisting: boolean
  persistSaved: boolean
  persistError: string | null
  onStudyAgain: () => void
  onChangeMode: () => void
  backTo: string
}

const scoreLabel = { great: 'Great', good: 'Good', needs_work: 'Needs work' }
const scoreMod = { great: styles.great, good: styles.good, needs_work: styles.needsWork }

export default function SentenceSummary({ entries, setTitle, isPersisting, persistSaved, persistError, onStudyAgain, onChangeMode, backTo }: Props) {
  const greatCount = entries.filter(e => e.score === 'great').length
  const goodCount = entries.filter(e => e.score === 'good').length
  const needsCount = entries.filter(e => e.score === 'needs_work').length

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <div className={styles.header}>
          <div className={styles.title}>Session complete</div>
          <div className={styles.meta}>{entries.length} sentence{entries.length !== 1 ? 's' : ''} written</div>
          <div className={styles.tally}>
            {greatCount > 0 && <span className={styles.tallyGreat}>{greatCount} great</span>}
            {goodCount > 0 && <span className={styles.tallyGood}>{goodCount} good</span>}
            {needsCount > 0 && <span className={styles.tallyNeeds}>{needsCount} needs work</span>}
          </div>
        </div>

        {/* Save status */}
        {isPersisting && (
          <div className={styles.saveStatus}>
            <svg className={styles.spinner} width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="6.5" cy="6.5" r="5" strokeOpacity="0.25"/><path d="M6.5 1.5a5 5 0 0 1 5 5" strokeLinecap="round"/></svg>
            Saving session…
          </div>
        )}
        {!isPersisting && persistSaved && !persistError && (
          <div className={styles.saveStatusOk}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 6l3 3 5-5"/></svg>
            Session saved
          </div>
        )}
        {persistError && <div className={styles.saveError}>{persistError}</div>}

        {/* Sentence list */}
        <div className={styles.list}>
          {entries.map((e, i) => (
            <div key={i} className={styles.entry}>
              <div className={styles.entryTop}>
                <span className={styles.entryTerm}>{e.term}</span>
                <span className={[styles.badge, scoreMod[e.score]].join(' ')}>{scoreLabel[e.score]}</span>
              </div>
              <div className={styles.entrySentence}>"{e.sentence}"</div>
              <div className={styles.entryFeedback}>{e.feedback}</div>
              {e.improved && (
                <div className={styles.entryImproved}>
                  <span className={styles.improvedLabel}>Suggestion</span>
                  <span className={styles.improvedText}>"{e.improved}"</span>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className={styles.actions}>
          <button
            className={styles.exportBtn}
            onClick={() => exportSentencesToExcel(entries, setTitle)}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M7 1v8M4 6l3 3 3-3M2 10v2a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-2"/></svg>
            Export to Excel
          </button>
          <button className={styles.studyAgainBtn} onClick={onStudyAgain} disabled={isPersisting}>
            Study again
          </button>
          <button className={styles.changeModeBtn} onClick={onChangeMode} disabled={isPersisting}>
            Change mode
          </button>
          <a href={backTo} className={styles.doneBtn}>Back to set</a>
        </div>
      </div>
    </div>
  )
}
