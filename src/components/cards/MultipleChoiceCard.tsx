import { useStudyStore } from '@/store/studyStore'
import styles from './StudyModes.module.css'

export default function MultipleChoiceCard() {
  const {
    sessionCards, currentIndex, mcQuestions,
    selectedOption, mcResult, selectMCOption,
  } = useStudyStore()

  const card = sessionCards[currentIndex]
  const question = mcQuestions[currentIndex]

  if (!card || !question) return null

  return (
    <div className={styles.mcWrap}>
      <div className={styles.mcQuestion}>
        <div className={styles.mcLabel}>What is the definition of…</div>
        <div className={styles.mcTerm}>{card.term}</div>
      </div>

      <div className={styles.mcOptions}>
        {question.options.map((opt, i) => {
          let state: 'idle' | 'correct' | 'incorrect' | 'dim' = 'idle'
          if (selectedOption !== null) {
            if (i === question.correctIndex) state = 'correct'
            else if (i === selectedOption && mcResult === 'incorrect') state = 'incorrect'
            else state = 'dim'
          }

          return (
            <button
              key={i}
              className={[styles.mcOption, styles[`mcOption-${state}`]].join(' ')}
              onClick={() => selectMCOption(i)}
              disabled={selectedOption !== null}
            >
              <span className={styles.mcOptionLetter}>
                {['A', 'B', 'C', 'D'][i]}
              </span>
              <span className={styles.mcOptionText}>{opt}</span>
              {state === 'correct' && (
                <svg className={styles.mcIcon} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 8l4 4 8-8"/></svg>
              )}
              {state === 'incorrect' && (
                <svg className={styles.mcIcon} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 2l12 12M14 2L2 14"/></svg>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
