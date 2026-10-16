import { useEffect, useState } from 'react'
import type { Card } from '@/lib/database.types'
import { getMasteryChange } from '@/lib/mastery'
import { useSRSStore } from '@/store/srsStore'
import { useStudyStore } from '@/store/studyStore'
import styles from './MasteryChange.module.css'

export default function MasteryChange({ cards, label = 'Set mastery' }: { cards: Card[]; label?: string }) {
  const before = useStudyStore(state => state.masteryBefore)
  const srs = useSRSStore(state => state.cardSRS)
  const sessionId = useStudyStore(state => state.sessionId)
  const [showAfter, setShowAfter] = useState(false)
  useEffect(() => {
    setShowAfter(false)
    const timer = setTimeout(() => setShowAfter(true), 250)
    return () => clearTimeout(timer)
  }, [sessionId])
  if (!before || !cards.length) return null
  const change = getMasteryChange(cards, before, srs)
  const direction = change.delta > 0 ? styles.gain : change.delta < 0 ? styles.loss : ''
  return <section className={styles.wrap} aria-label={`${label}: ${change.before}% to ${change.after}%`}>
    <div className={styles.heading}><span>{label}</span><span className={[styles.delta, direction].join(' ')}>
      {change.delta === 0 ? 'No change' : `${change.delta > 0 ? '+' : '−'}${Math.abs(change.delta)} pts`}
    </span></div>
    <div className={styles.values}>{change.before}% <span aria-hidden="true">→</span> <strong>{change.after}%</strong></div>
    <div className={styles.track} role="progressbar" aria-label={label} aria-valuenow={change.after} aria-valuemin={0} aria-valuemax={100}>
      <div className={styles.fill} style={{ width: `${showAfter ? change.after : change.before}%` }} />
      {showAfter && change.delta !== 0 && <div className={[styles.change, direction].join(' ')} style={{ left: `${Math.min(change.before, change.after)}%`, width: `${Math.abs(change.delta)}%` }} />}
      <div className={styles.marker} style={{ left: `${change.before}%` }} title={`Before this session: ${change.before}%`} />
    </div>
    <p>Mastery across {cards.length} cards. Correct recall on separate days builds it; missed answers can lower it.</p>
  </section>
}
