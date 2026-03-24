import { useState, useEffect } from 'react'
import type { Card } from '@/lib/database.types'
import styles from './FlashCard.module.css'

interface Props {
  card: Card
  index: number
  total: number
  onKnow: () => void
  onDontKnow: () => void
}

export default function FlashCard({ card, index, total, onKnow, onDontKnow }: Props) {
  const [flipped, setFlipped] = useState(false)

  const handleFlip = () => setFlipped((f) => !f)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return
      if (e.code === 'Space') { e.preventDefault(); handleFlip() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const handleKnow = () => {
    setFlipped(false)
    setTimeout(onKnow, 100)
  }

  const handleDontKnow = () => {
    setFlipped(false)
    setTimeout(onDontKnow, 100)
  }

  return (
    <div className={styles.wrap}>
      {/* Card */}
      <div className={styles.cardArea} onClick={handleFlip}>
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
