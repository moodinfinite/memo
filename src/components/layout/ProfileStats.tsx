import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { useProgressStore } from '@/store/progressStore'
import { useSRSStore } from '@/store/srsStore'
import { getMasteryLevel } from '@/lib/mastery'
import { MAX_LEVEL, isLevelCheckDue, levelHistory, rankFor, skillStats, type StatSkill } from '@/lib/levelTest'
import styles from './ProfileStats.module.css'

const ICONS: Record<StatSkill, string> = { vocabulary: '詞', grammar: '法', reading: '讀', writing: '寫' }

/** RPG-style stat sheet: HSK rank, one segmented bar per skill, and lifetime counts */
export default function ProfileStats({ name, collapsed, onClose }: { name: string; collapsed: boolean; onClose: () => void }) {
  const user = useAuthStore(s => s.user)
  const dayStreak = useProgressStore(s => s.dayStreak)
  const cardSRS = useSRSStore(s => s.cardSRS)
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void useSRSStore.getState().fetchAllSRS()
    void useProgressStore.getState().fetchProgress()
    panel.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const history = levelHistory(user?.user_metadata)
  const latest = history[0]
  const rank = latest ? rankFor(latest.level) : null
  const due = isLevelCheckDue(history)
  const srs = Object.values(cardSRS)
  const mastered = srs.filter(s => getMasteryLevel(s) === 4).length

  return createPortal(
    <>
      <div className={styles.backdrop} onClick={onClose} />
      <div ref={panel} tabIndex={-1} role="dialog" aria-label="Your stats"
        className={[styles.panel, collapsed ? styles.panelCollapsed : ''].join(' ')}>
        <div className={styles.head}>
          <div className={styles.avatar} aria-hidden="true">{name.slice(0, 1).toUpperCase()}</div>
          <div className={styles.who}>
            <div className={styles.name}>{name}</div>
            <div className={styles.rank}>
              {latest && rank ? <>HSK {latest.level} · {rank.en} <span lang="zh-Hant">{rank.zh}</span></> : 'No level yet'}
            </div>
          </div>
          <button className={styles.close} onClick={onClose} aria-label="Close stats">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 2l8 8M10 2L2 10"/></svg>
          </button>
        </div>

        <div className={styles.stats}>
          {skillStats(history).map(({ skill, level, previous }) => (
            <div key={skill} className={styles.stat}>
              <span className={styles.icon} lang="zh-Hant" aria-hidden="true">{ICONS[skill]}</span>
              <span className={styles.skill}>{skill}</span>
              <span className={styles.bar} role="img"
                aria-label={level ? `HSK ${level}${previous !== null && level > previous ? `, up from ${previous}` : ''}` : 'Not tested yet'}>
                {Array.from({ length: MAX_LEVEL }, (_, i) => {
                  const filled = level !== null && i < level
                  const gained = filled && previous !== null && i >= previous
                  return <i key={i} className={gained ? styles.gained : filled ? styles.on : undefined} style={{ animationDelay: `${i * 50}ms` }} />
                })}
              </span>
              <span className={styles.value}>{level ?? '–'}</span>
            </div>
          ))}
        </div>
        {history.length > 1 && <div className={styles.legend}><i className={styles.gained} /> gained since last check</div>}

        <div className={styles.counts}>
          <div><b>{srs.length}</b>words</div>
          <div><b>{mastered}</b>mastered</div>
          <div><b>{dayStreak}</b>day streak</div>
        </div>

        <Link to="/level" className={due ? styles.cta : styles.ctaQuiet} onClick={onClose}>
          {!latest ? 'Take your first level check' : due ? 'Monthly level check is due' : `Last checked ${new Date(latest.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · history`}
        </Link>
      </div>
    </>,
    document.body,
  )
}
