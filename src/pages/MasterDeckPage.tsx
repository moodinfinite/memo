import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useStudyStore } from '@/store/studyStore'
import type { Card, StudyMode } from '@/lib/database.types'
import FlashCard from '@/components/cards/FlashCard'
import MultipleChoiceCard from '@/components/cards/MultipleChoiceCard'
import TypedAnswerCard from '@/components/cards/TypedAnswerCard'
import { CountUpScore, PerfectScore, StreakBurst } from './StudyPage'
import styles from './StudyPage.module.css'
import mStyles from './MasterDeckPage.module.css'

const MODES: { id: StudyMode; label: string; desc: string }[] = [
  { id: 'flashcard', label: 'Flashcards', desc: 'Flip and self-assess' },
  { id: 'multiple_choice', label: 'Multiple choice', desc: 'Pick the right answer' },
  { id: 'typed', label: 'Typed answer', desc: 'Write the definition' },
]
const TIMER_OPTS = [{ label: '1 min', mins: 1 }, { label: '3 min', mins: 3 }, { label: '5 min', mins: 5 }, { label: '10 min', mins: 10 }]

export default function MasterDeckPage() {
  const {
    mode, sessionCards, currentIndex, known, unknown, isComplete,
    timerSecsLeft, timerOn, mcStreak,
    startSession, markKnown, markUnknown, resetSession, persistSession,
    tickTimer, selectMCOption, reshuffleRemaining,
  } = useStudyStore()

  const [allCards, setAllCards] = useState<Card[]>([])
  const [setCount, setSetCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [selecting, setSelecting] = useState(true)
  const [selectedMode, setSelectedMode] = useState<StudyMode>('flashcard')
  const [doShuffle, setDoShuffle] = useState(false)
  const [timerEnabled, setTimerEnabled] = useState(false)
  const [timerDur, setTimerDur] = useState(5)
  const [flipKey, setFlipKey] = useState(0)
  const [shuffleActive, setShuffleActive] = useState(false)
  const [burstMsg, setBurstMsg] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    fetchAll()
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  const fetchAll = async () => {
    setLoading(true)
    const { data } = await supabase.from('cards').select('*').order('set_id')
    if (data) {
      setAllCards(data)
      setSetCount(new Set(data.map((c: Card) => c.set_id)).size)
    }
    setLoading(false)
  }

  useEffect(() => {
    if (!isComplete && timerOn && !selecting) {
      timerRef.current = setInterval(() => tickTimer(), 1000)
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [timerOn, selecting, isComplete])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return
      if (selecting || isComplete) return
      if (mode === 'flashcard') {
        if (e.code === 'Space') { e.preventDefault(); setFlipKey((k) => k + 1) }
        if (e.code === 'ArrowLeft') { e.preventDefault(); markUnknown() }
        if (e.code === 'ArrowRight') { e.preventDefault(); markKnown() }
      }
      if (mode === 'multiple_choice') {
        if (e.code === 'Digit1') { e.preventDefault(); selectMCOption(0) }
        if (e.code === 'Digit2') { e.preventDefault(); selectMCOption(1) }
        if (e.code === 'Digit3') { e.preventDefault(); selectMCOption(2) }
        if (e.code === 'Digit4') { e.preventDefault(); selectMCOption(3) }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selecting, isComplete, mode])

  useEffect(() => { setFlipKey(0) }, [currentIndex])

  const BURST_MSGS = ['On a roll!', 'Unstoppable!', 'On fire!', 'Legendary!']
  useEffect(() => {
    if (mcStreak === 0 || mcStreak % 5 !== 0) return
    const idx = Math.floor(mcStreak / 5) - 1
    setBurstMsg(BURST_MSGS[Math.min(idx, BURST_MSGS.length - 1)])
    setTimeout(() => setBurstMsg(null), 2000)
  }, [mcStreak])

  const handleStart = () => {
    startSession(allCards, selectedMode, '__master__', { shuffle: doShuffle, timerDurMin: timerEnabled ? timerDur : 0 })
    setSelecting(false)
  }

  const handleEnd = () => {
    if (!isComplete) persistSession()
    resetSession()
    setSelecting(true)
  }
  const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60 < 10 ? '0' : '')}${s % 60}`
  const canMC = allCards.length >= 4

  if (loading) return <div className={styles.loading}>Loading…</div>

  if (selecting) return (
    <div className={styles.page}>
      <div className={mStyles.header}>
        <div className={mStyles.icon}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="2" y="5" width="16" height="12" rx="2"/>
            <path d="M6 5V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1M6 10h8M6 14h5"/>
          </svg>
        </div>
        <div>
          <h1 className={mStyles.title}>Master Deck</h1>
          <p className={mStyles.meta}>{allCards.length} cards across {setCount} set{setCount === 1 ? '' : 's'} · auto-synced</p>
        </div>
      </div>

      <div className={styles.modeSelector}>
        <div className={styles.modeSelectorTitle}>Choose a study mode</div>
        <div className={styles.modeOptions}>
          {MODES.map((m) => {
            const disabled = m.id === 'multiple_choice' && !canMC
            return (
              <button key={m.id}
                className={[styles.modeOption, selectedMode === m.id ? styles.modeSelected : '', disabled ? styles.modeDisabled : ''].join(' ')}
                onClick={() => !disabled && setSelectedMode(m.id)}
                disabled={disabled}
              >
                <div className={styles.modeLabel}>{m.label}</div>
                <div className={styles.modeDesc}>{disabled ? 'Needs 4+ cards' : m.desc}</div>
              </button>
            )
          })}
        </div>
        <div className={styles.sessionOpts}>
          <button className={[styles.sessionOpt, doShuffle ? styles.sessionOptActive : ''].join(' ')} onClick={() => setDoShuffle(v => !v)}>
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M1 4h9m0 0l-2-2m2 2l-2 2M14 11H5m0 0l2-2m-2 2l2 2"/></svg>
            <div><div className={styles.sessionOptLabel}>Shuffle</div><div className={styles.sessionOptDesc}>Random order</div></div>
          </button>
          <button className={[styles.sessionOpt, timerEnabled ? styles.sessionOptActive : ''].join(' ')} onClick={() => setTimerEnabled(v => !v)}>
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="7.5" cy="8" r="5"/><path d="M7.5 5.5V8l2 1.5M5.5 1.5h4"/></svg>
            <div><div className={styles.sessionOptLabel}>Timer</div><div className={styles.sessionOptDesc}>{timerEnabled ? `${timerDur} min` : 'Off'}</div></div>
          </button>
        </div>
        {timerEnabled && (
          <div className={styles.timerPicker}>
            {TIMER_OPTS.map((t) => (
              <button key={t.mins} className={[styles.timerOpt, timerDur === t.mins ? styles.timerOptSelected : ''].join(' ')} onClick={() => setTimerDur(t.mins)}>{t.label}</button>
            ))}
          </div>
        )}
        <button className={styles.startBtn} onClick={handleStart}>Start studying</button>
      </div>
    </div>
  )

  if (isComplete) {
    const total = sessionCards.length, k = known.length, u = unknown.length
    const pct = total > 0 ? Math.round((k / total) * 100) : 0
    return (
      <div className={styles.page}>
        <div className={styles.summaryWrap}>
          <div className={styles.summary}>
            {pct === 100
              ? <PerfectScore total={total} known={k} unknown={u} />
              : <CountUpScore pct={pct} total={total} known={k} unknown={u} />
            }
            <div className={styles.summaryActions}>
              <button className={styles.retryBtn} onClick={() => { startSession(allCards, mode, '__master__', { shuffle: doShuffle, timerDurMin: timerEnabled ? timerDur : 0 }) }}>Study again</button>
              <button className={styles.changeModeBtn} onClick={handleEnd}>Change mode</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={handleEnd}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M10 3L5 8l5 5"/></svg>
          Master Deck
        </button>
        <div className={styles.topBarRight}>
          {(mode === 'flashcard' || mode === 'multiple_choice') && (
            <button
              className={[styles.shuffleBtn, shuffleActive ? styles.shuffleBtnActive : ''].join(' ')}
              onClick={() => { const next = !shuffleActive; setShuffleActive(next); if (next) reshuffleRemaining() }}
              title={shuffleActive ? 'Shuffle on' : 'Shuffle off'}
            >
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M1 4h9m0 0l-2-2m2 2l-2 2M14 11H5m0 0l2-2m-2 2l2 2"/></svg>
            </button>
          )}
          <div className={styles.modeTag}>{MODES.find(m => m.id === mode)?.label}</div>
          <button className={styles.exitBtn} onClick={handleEnd}>End session</button>
        </div>
      </div>
      <div className={styles.progressRow}>
        <div className={styles.progressTrack}><div className={styles.progressFill} style={{ width: `${(currentIndex / sessionCards.length) * 100}%` }} /></div>
        <span className={styles.progressLabel}>{currentIndex + 1} / {sessionCards.length}</span>
      </div>
      {mode === 'flashcard' && <FlashCard card={sessionCards[currentIndex]} index={currentIndex} total={sessionCards.length} onKnow={markKnown} onDontKnow={markUnknown} flipKey={flipKey} />}
      {mode === 'multiple_choice' && <MultipleChoiceCard />}
      {mode === 'typed' && <TypedAnswerCard />}
      {timerOn && (
        <div className={[styles.timerDisplay, timerSecsLeft <= 30 ? styles.timerUrgent : ''].join(' ')}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="6.5" cy="7" r="4.5"/><path d="M6.5 4.5V7l1.5 1M4.5 1h4"/></svg>
          {fmt(timerSecsLeft)}
        </div>
      )}
      {mode === 'flashcard' && (
        <div className={styles.kbdHint}>
          <span className={styles.kbd}><kbd>Space</kbd> flip</span>
          <span className={styles.kbd}><kbd>←</kbd> still learning</span>
          <span className={styles.kbd}><kbd>→</kbd> got it</span>
        </div>
      )}
      {mode === 'multiple_choice' && (
        <div className={styles.kbdHint}>
          <span className={styles.kbd}><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd><kbd>4</kbd> select answer</span>
        </div>
      )}
      {burstMsg && <StreakBurst msg={burstMsg} streak={mcStreak} />}
    </div>
  )
}
