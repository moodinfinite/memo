import { useRef, useEffect } from 'react'
import { useStudyStore } from '@/store/studyStore'
import styles from './SentenceCard.module.css'

export default function SentenceCard() {
  const {
    sessionCards, currentIndex,
    sentenceInput, sentenceStatus, sentenceFeedback, sentenceImproved, sentenceScore,
    setSentenceInput, submitSentence, nextSentenceCard,
  } = useStudyStore()

  const card = sessionCards[currentIndex]
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (sentenceStatus === 'idle') inputRef.current?.focus()
  }, [currentIndex, sentenceStatus])

  // Enter to advance after AI review
  useEffect(() => {
    if (sentenceStatus !== 'reviewed') return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); nextSentenceCard() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [sentenceStatus])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && sentenceStatus === 'idle') {
      e.preventDefault()
      if (sentenceInput.trim()) submitSentence()
    }
  }

  if (!card) return null

  const scoreLabel = { great: 'Great!', good: 'Good', needs_work: 'Needs work' }
  const scoreMod = sentenceScore ? styles[`score_${sentenceScore}`] : ''

  return (
    <div className={styles.wrap}>
      <div className={styles.cardHeader}>
        <div className={styles.termLabel}>Use this word in a sentence</div>
        <div className={styles.term}>{card.term}</div>
        <div className={styles.definition}>{card.definition}</div>
      </div>

      <div className={[styles.inputWrap, sentenceStatus === 'reviewed' ? styles.inputDone : ''].join(' ')}>
        <textarea
          ref={inputRef}
          className={styles.input}
          value={sentenceInput}
          onChange={e => setSentenceInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Write a sentence using "${card.term}"…`}
          rows={3}
          disabled={sentenceStatus !== 'idle'}
        />
        {sentenceStatus === 'idle' && (
          <div className={styles.hint}>Enter to submit · Shift+Enter for new line</div>
        )}
      </div>

      {sentenceStatus === 'idle' && (
        <button
          className={styles.submitBtn}
          onClick={() => submitSentence()}
          disabled={!sentenceInput.trim()}
        >
          Check with AI
        </button>
      )}

      {sentenceStatus === 'submitting' && (
        <div className={styles.loading}>
          <svg className={styles.spinner} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="8" cy="8" r="6" strokeOpacity="0.25"/>
            <path d="M8 2a6 6 0 0 1 6 6" strokeLinecap="round"/>
          </svg>
          AI is reviewing…
        </div>
      )}

      {sentenceStatus === 'reviewed' && (
        <div className={styles.feedback}>
          <div className={[styles.scoreBadge, scoreMod].join(' ')}>
            {sentenceScore === 'great' && (
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 7l3 3 6-6"/></svg>
            )}
            {scoreLabel[sentenceScore!]}
          </div>
          <p className={styles.feedbackText}>{sentenceFeedback}</p>
          {sentenceImproved && (
            <div className={styles.improvedBox}>
              <div className={styles.improvedLabel}>Suggested improvement</div>
              <div className={styles.improvedText}>"{sentenceImproved}"</div>
            </div>
          )}
          <button className={styles.nextBtn} onClick={nextSentenceCard}>
            Next
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 7h8M7 3l4 4-4 4"/></svg>
          </button>
          <div className={styles.hint}>Press Enter to continue</div>
        </div>
      )}
    </div>
  )
}
