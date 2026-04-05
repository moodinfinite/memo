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

  const handleFlip = () => setFlipped((f) => !f)

  useEffect(() => {
    if ((flipKey ?? 0) > 0) setFlipped((f) => !f)
  }, [flipKey])

  const handleKnow = () => {
    setFlash('correct')
    setTimeout(() => { setFlash(null); setFlipped(false) }, 320)
    setTimeout(onKnow, 320)
  }

  const handleDontKnow = () => {
    setFlash('incorrect')
    setTimeout(() => { setFlash(null); setFlipped(false) }, 320)
    setTimeout(onDontKnow, 320)
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
        <button className={styles.dontKnow} onClick={handleDontKnow}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M2 2l12 12M14 2L2 14" />
          </svg>
          Still learning
        </button>
        <button className={styles.know} onClick={handleKnow}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M2 8l4 4 8-8" />
          </svg>
          Got it
        </button>
      </div>
    </div>
  )
}
