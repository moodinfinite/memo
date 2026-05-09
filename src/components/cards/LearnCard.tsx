import { useState, useEffect } from 'react'
import { useStudyStore } from '@/store/studyStore'
import type { Card } from '@/lib/database.types'
import styles from './LearnCard.module.css'

function makeMCOptions(card: Card, allCards: Card[]) {
  const others = allCards.filter(c => c.id !== card.id)
  const distractors = [...others].sort(() => Math.random() - 0.5).slice(0, 3).map(c => c.definition)
  return [card.definition, ...distractors]
    .sort(() => Math.random() - 0.5)
    .map(text => ({ text, correct: text === card.definition }))
}

export default function LearnCard() {
  const {
    learnBatch, learnBatchIdx, learnScores, learnGraduated, learnCards, learnQueue, answerLearnCard,
  } = useStudyStore()

  const card = learnBatch[learnBatchIdx]
  const score = learnScores[card?.id ?? ''] ?? 0
  const isFlashcard = score === 0
  const totalCards = learnGraduated.length + learnBatch.length + learnQueue.length

  const [revealed, setRevealed] = useState(false)
  const [flash, setFlash] = useState<'correct' | 'incorrect' | null>(null)
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const [mcResult, setMcResult] = useState<'idle' | 'correct' | 'incorrect'>('idle')
  const [mcOptions, setMcOptions] = useState<{ text: string; correct: boolean }[]>([])

  // Reset local UI state when card or view type changes
  useEffect(() => {
    setRevealed(false)
    setFlash(null)
    setSelectedIdx(null)
    setMcResult('idle')
    if (!isFlashcard && card && learnCards.length >= 4) {
      setMcOptions(makeMCOptions(card, learnCards))
    }
  }, [card?.id, isFlashcard])

  // Auto-clear flash (safety net)
  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 950)
    return () => clearTimeout(t)
  }, [flash])

  if (!card) return null
  const canMC = learnCards.length >= 4

  const handleFlashAnswer = (correct: boolean) => {
    if (flash) return
    setFlash(correct ? 'correct' : 'incorrect')
    setTimeout(() => answerLearnCard(correct), 800)
  }

  const handleMCSelect = (idx: number, correct: boolean) => {
    if (selectedIdx !== null) return
    setSelectedIdx(idx)
    setMcResult(correct ? 'correct' : 'incorrect')
    setTimeout(() => answerLearnCard(correct), 1000)
  }

  return (
    <div className={styles.wrap}>
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
        <div className={styles.learnedCount}>{learnGraduated.length} / {totalCards} learned</div>
      </div>

      {isFlashcard || !canMC ? (
        /* ── Flashcard view ── */
        <div className={styles.cardWrap}>
          <div className={styles.card}>
            {flash && <div className={[styles.flashOverlay, flash === 'correct' ? styles.flashCorrect : styles.flashIncorrect].join(' ')} />}
            <div className={styles.cardSideLabel}>Term</div>
            <div className={styles.cardTerm}>{card.term}</div>
            {!revealed ? (
              <button className={styles.revealBtn} onClick={() => setRevealed(true)}>
                See Definition
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6.5 1v11M1 6.5h11"/></svg>
              </button>
            ) : (
              <div className={styles.definitionReveal}>
                <div className={styles.defDivider} />
                <div className={styles.defLabel}>Definition</div>
                <div className={styles.defText}>{card.definition}</div>
              </div>
            )}
          </div>
          {revealed && (
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
          )}
        </div>
      ) : (
        /* ── Multiple choice view ── */
        <div className={styles.mcWrap}>
          <div className={styles.mcQuestion}>
            <div className={styles.mcLabel}>What is the definition of…</div>
            <div className={styles.mcTerm}>{card.term}</div>
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
