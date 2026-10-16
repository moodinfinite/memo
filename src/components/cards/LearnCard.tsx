import QuickEditCard from '@/components/study/QuickEditCard'
import { useState, useEffect, useRef } from 'react'
import { useStudyStore } from '@/store/studyStore'
import { makeLearnChoices } from '@/lib/learnChoices'
import type { Card } from '@/lib/database.types'
import styles from './LearnCard.module.css'

export default function LearnCard() {
  const {
    sessionId, learnTurn, learnBatch, learnBatchIdx, learnScores, learnGraduated, learnCards, answerLearnCard,
    learnBatchComplete, learnBatchSummary, advanceToNextBatch,
  } = useStudyStore()

  const activeCard = learnBatch[learnBatchIdx]
  const [feedback, setFeedback] = useState<{ card: Card; recall: boolean } | null>(null)
  const answerLock = useRef(false)
  const answerTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flipTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (answerTimer.current) clearTimeout(answerTimer.current)
    if (flipTimer.current) clearTimeout(flipTimer.current)
  }, [sessionId])
  const card = feedback?.card ?? activeCard
  const score = learnScores[card?.id ?? ''] ?? 0
  const isFlashcard = feedback?.recall ?? (score >= 1)
  const totalCards = learnCards.length
  const canMC = !!card && makeLearnChoices(card, learnCards).length === 4

  const [showDef, setShowDef] = useState(false)
  const [flipped, setFlipped] = useState(false)
  const [isFlipping, setIsFlipping] = useState(false)
  const [flash, setFlash] = useState<'correct' | 'incorrect' | null>(null)
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const [mcOptions, setMcOptions] = useState<{ text: string; correct: boolean }[]>([])

  const recordAnswer = (correct: boolean, duration: number) => {
    if (!card || answerLock.current || useStudyStore.getState().editingCard) return false
    answerLock.current = true
    setFeedback({ card, recall: isFlashcard })
    // Save now. The timer only controls feedback, so closing the page cannot lose the answer.
    answerLearnCard(correct, { sessionId, turn: learnTurn })
    answerTimer.current = setTimeout(() => setFeedback(null), duration)
    return true
  }
  const handleFlashAnswer = (correct: boolean) => {
    if (!recordAnswer(correct, correct ? 800 : 2000)) return
    setFlash(correct ? 'correct' : 'incorrect')
    setFlipped(false)
    setShowDef(!correct)
  }
  const handleMCSelect = (idx: number, correct: boolean) => {
    if (recordAnswer(correct, 1000)) setSelectedIdx(idx)
  }

  // Reset local UI state when card or view type changes
  useEffect(() => {
    if (feedback) return
    answerLock.current = false
    if (flipTimer.current) clearTimeout(flipTimer.current)
    setShowDef(false)
    setFlipped(false)
    setIsFlipping(false)
    setFlash(null)
    setSelectedIdx(null)
    if (!isFlashcard && card && canMC) {
      setMcOptions(makeLearnChoices(card, learnCards))
    }
  }, [card?.id, card?.term, card?.definition, isFlashcard, learnTurn, feedback, sessionId])

  // Keyboard shortcuts for MC (1-4)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (useStudyStore.getState().editingCard) return
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return
      if (isFlashcard || !canMC) return
      if (selectedIdx !== null) return
      const map: Record<string, number> = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3 }
      const idx = map[e.code]
      if (idx !== undefined && idx < mcOptions.length) {
        e.preventDefault()
        handleMCSelect(idx, mcOptions[idx].correct)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isFlashcard, canMC, selectedIdx, mcOptions])

  // ── Batch complete screen ──────────────────────────────────────
  if (learnBatchComplete) {
    return (
      <div className={styles.batchCompleteWrap}>
        <div className={styles.batchCompleteIcon}>
          <svg width="26" height="26" viewBox="0 0 26 26" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 13l6 6L22 7"/></svg>
        </div>
        <div className={styles.batchCompleteTitle}>Batch complete!</div>
        <div className={styles.batchCompleteSub}>You practised {learnBatchSummary.length} {learnBatchSummary.length === 1 ? 'word' : 'words'} this round</div>
        <div className={styles.chipGrid}>
          {learnBatchSummary.map((c, i) => (
            <div key={c.id} className={styles.chip} style={{ animationDelay: `${i * 55}ms` }}>
              {c.term}
            </div>
          ))}
        </div>
        <div className={styles.batchProgressBar}>
          <div className={styles.batchProgressFill} style={{ width: `${(learnGraduated.length / totalCards) * 100}%` }} />
        </div>
        <div className={styles.batchProgressLabel}>{learnGraduated.length} of {totalCards} cards practised</div>
        <button className={styles.continueBtn} onClick={advanceToNextBatch}>
          Continue
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 7h8M7 3l4 4-4 4"/></svg>
        </button>
      </div>
    )
  }
  // ──────────────────────────────────────────────────────────────

  if (!card) return null

  return (
    <div className={styles.wrap}>
      <QuickEditCard card={card} disabled={!!flash || selectedIdx !== null} />
      {/* Batch progress */}
      <div className={styles.progressRow}>
        <div className={styles.batchDots}>
          {learnBatch.map((c, i) => {
            const s = learnScores[c.id] ?? 0
            return (
              <div key={c.id} className={[
                styles.dot,
                i === learnBatchIdx ? styles.dotCurrent : '',
                s >= 1 && i !== learnBatchIdx ? styles.dotSeen : '',
              ].join(' ')} />
            )
          })}
        </div>
        <div className={styles.learnedCount}>{learnGraduated.length} / {totalCards} practised</div>
      </div>

      {isFlashcard || !canMC ? (
        /* ── Flashcard view ── */
        <div className={styles.cardWrap}>
          <div
            className={[styles.card, isFlipping ? styles.cardFlipping : ''].join(' ')}
            onClick={() => {
            if (flash || isFlipping) return
            setIsFlipping(true)
            flipTimer.current = setTimeout(() => { setFlipped(v => !v); setIsFlipping(false) }, 140)
          }}
            style={{ cursor: flash ? 'default' : 'pointer' }}
            title="Tap to flip"
          >
            {flash && <div className={[styles.flashOverlay, flash === 'correct' ? styles.flashCorrect : styles.flashIncorrect].join(' ')} />}
            {!flipped ? (
              <>
                <div className={styles.cardSideLabel}>Definition</div>
                <div className={styles.cardTerm}>{card.definition}</div>
              </>
            ) : (
              <>
                <div className={styles.cardSideLabel}>Term</div>
                <div className={styles.cardTerm}>{card.term}</div>
              </>
            )}
            {showDef && !flipped && (
              <div className={styles.definitionReveal}>
                <div className={styles.defDivider} />
                <div className={styles.defLabel}>Term</div>
                <div className={styles.defText}>{card.term}</div>
              </div>
            )}
          </div>
          <div className={styles.flashActions}>
            <button className={styles.dontKnowBtn} onClick={() => handleFlashAnswer(false)} disabled={!!flash}>
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 2l11 11M13 2L2 13"/></svg>
              Still learning
            </button>
            <button className={styles.knowBtn} onClick={() => handleFlashAnswer(true)} disabled={!!flash}>
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 7.5l3.5 3.5 7-7"/></svg>
              Got it
            </button>
          </div>
        </div>
      ) : (
        /* ── Multiple choice view ── */
        <div className={styles.mcWrap}>
          <div className={styles.mcQuestion}>
            <div className={styles.mcLabel}>Which term matches this definition?</div>
            <div className={styles.mcTerm}>{card.definition}</div>
          </div>
          <div className={styles.mcOptions}>
            {mcOptions.map((opt, i) => {
              let state: 'idle' | 'correct' | 'incorrect' | 'dim' = 'idle'
              if (selectedIdx !== null) {
                if (opt.correct) state = 'correct'
                else if (i === selectedIdx) state = 'incorrect'
                else state = 'dim'
              }
              return (
                <button
                  key={i}
                  className={[styles.mcOption, styles[`mcOption_${state}`]].join(' ')}
                  onClick={() => handleMCSelect(i, opt.correct)}
                  disabled={selectedIdx !== null}
                >
                  <span className={styles.mcLetter}>{['1', '2', '3', '4'][i]}</span>
                  <span className={styles.mcText}>{opt.text}</span>
                  {state === 'correct' && <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 7.5l3.5 3.5 7-7"/></svg>}
                  {state === 'incorrect' && <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 2l11 11M13 2L2 13"/></svg>}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
