import styles from './StudyControls.module.css'
import { useStudyStore } from '@/store/studyStore'

type Props = { startSide?: 'term' | 'definition' | 'random'; onToggleSide?: () => void; onShuffle?: () => void; shuffleOn?: boolean }
export default function StudyControls({ startSide, onToggleSide, onShuffle, shuffleOn }: Props) {
  const shuffleDisabled = useStudyStore(s => s.editingCard || s.isAdvancing || s.mcResult !== 'idle' || s.typedResult !== 'idle')
  return <div className={styles.controls}>
    {onToggleSide && <span className={styles.tool}>
      <button className={styles.button} onClick={onToggleSide}
        aria-label={startSide === 'definition' ? 'Show term first' : 'Show definition first'}>
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="4" y="2" width="12" height="16" rx="2"/><path d="M7 7h6M7 10h4"/><path d="M1 8v6l2-2M19 12V6l-2 2"/></svg>
        <span>{startSide === 'definition' ? 'Definition first' : startSide === 'random' ? 'Random side' : 'Term first'}</span>
      </button>
      <span className={styles.tooltip} role="tooltip">Switch which side of the card appears first</span>
    </span>}
    {onShuffle && <span className={styles.tool}>
      <button className={styles.button} onClick={onShuffle} aria-label="Shuffle" aria-pressed={shuffleOn} disabled={shuffleDisabled}>
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 4h2c4 0 8 12 12 12h2M2 16h2c1.5 0 3-2 4.5-4M11.5 8C13 6 14.5 4 16 4h2M15 1l3 3-3 3M15 13l3 3-3 3"/></svg>
        <span>Shuffle</span>
      </button>
      <span className={styles.tooltip} role="tooltip">{shuffleOn ? 'Turn off shuffle and restore the upcoming cards’ order' : 'Turn on shuffle for upcoming cards'}</span>
    </span>}
  </div>
}
