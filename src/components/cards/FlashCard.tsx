import { useState, useEffect } from 'react'
import type { Card } from '@/lib/database.types'
import styles from './FlashCard.module.css'

interface Props {
  card: Card
  index: number
  total: number
  onKnow: () => void
  onDontKnow: () => void
  flipKey?: number
}

export default function FlashCard({ card, index, total, onKnow, onDontKnow, flipKey }: Props) {
  const [flipped, setFlipped] = useState(false)
  const [flash, setFlash] = useState<'correct' | 'incorrect' | null>(null)

  const answering = flash !== null

  const handleFlip = () => { if (!answering) setFlipped((f) => !f) }

  useEffect(() => {
    if ((flipKey ?? 0) > 0) setFlipped((f) => !f)
  }, [flipKey])

  const handleKnow = () => {
    if (answering) return
    setFlash('correct')
    // Component remounts (key={currentIndex} in StudyPage) after onKnow triggers
    // currentIndex change — no need to manually reset state
    setTimeout(onKnow, 650)
  }

  const handleDontKnow = () => {
    if (answering) return
    setFlash('incorrect')
    setTimeout(onDontKnow, 650)
  }

  return (
    <div className={styles.wrap}>
      {/* Card */}
      <div className={styles.cardArea} onClick={handleFlip}>
        {flash && <div className={[styles.flashOverlay, flash === 'correct' ? styles.flashCorrect : styles.flashIncorrect].join(' ')} />}
        <div className={[styles.scene, flipped ? styles.flipped : ''].join(' ')}>
          <div className={[styles.face, styles.front].join(' ')}>
            <div className={styles.sideLabel}>Term</div>
            <div className={styles.content}>{card.term}</div>
            <div className={styles.tapHint}>tap to flip</div>
          </div>
          <div className={[styles.face, styles.back].join(' ')}>
            <div className={styles.sideLabel}>Definition</div>
            <div className={styles.content}>{card.definition}</div>
            <div className={styles.tapHint}>tap to flip back</div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className={styles.actions}>
        <button className={`${styles.dontKnow}${answering ? ' ' + styles.answeringBtn : ''}`} onClick={handleDontKnow} disabled={answering}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M2 2l12 12M14 2L2 14" />
          </svg>
          Still learning
        </button>
        <button className={`${styles.know}${answering ? ' ' + styles.answeringBtn : ''}`} onClick={handleKnow} disabled={answering}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M2 8l4 4 8-8" />
          </svg>
          Got it
        </button>
      </div>
    </div>
  )
}
