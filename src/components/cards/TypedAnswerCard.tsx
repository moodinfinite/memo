import { useRef, useEffect } from 'react'
import { useStudyStore } from '@/store/studyStore'
import styles from './StudyModes.module.css'

export default function TypedAnswerCard() {
  const {
    sessionCards, currentIndex,
    typedAnswer, typedResult,
    setTypedAnswer, submitTyped,
  } = useStudyStore()

  const card = sessionCards[currentIndex]
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [currentIndex])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && typedResult === 'idle') {
      e.preventDefault()
      if (typedAnswer.trim()) submitTyped()
    }
  }

  if (!card) return null

  return (
    <div className={styles.typedWrap}>
      <div className={styles.typedQuestion}>
        <div className={styles.typedLabel}>Define this term</div>
        <div className={styles.typedTerm}>{card.term}</div>
      </div>

      <div className={[styles.typedInputWrap, typedResult !== 'idle' ? styles[`typed-${typedResult}`] : ''].join(' ')}>
        <textarea
          ref={inputRef}
          className={styles.typedInput}
          value={typedAnswer}
          onChange={(e) => setTypedAnswer(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your answer…"
          rows={3}
          disabled={typedResult !== 'idle'}
        />
        {typedResult === 'idle' && (
          <div className={styles.typedHint}>Enter to submit · Shift+Enter for new line</div>
        )}
        {typedResult === 'correct' && (
          <div className={styles.typedFeedback + ' ' + styles.feedbackCorrect}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 8l4 4 8-8"/></svg>
            Correct!
          </div>
        )}
        {typedResult === 'incorrect' && (
          <div className={styles.typedFeedback + ' ' + styles.feedbackIncorrect}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 2l12 12M14 2L2 14"/></svg>
            Not quite
          </div>
        )}
      </div>

      {typedResult === 'incorrect' && (
        <div className={styles.typedCorrectAnswer}>
          <div className={styles.typedCorrectLabel}>Correct answer</div>
          <div className={styles.typedCorrectText}>{card.definition}</div>
        </div>
      )}

      {typedResult === 'idle' && (
        <button
          className={styles.typedSubmit}
          onClick={submitTyped}
          disabled={!typedAnswer.trim()}
        >
          Check answer
        </button>
      )}
    </div>
  )
}
