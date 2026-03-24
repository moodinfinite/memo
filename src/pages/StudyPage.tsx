import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useSetsStore } from '@/store/setsStore'
import { useStudyStore } from '@/store/studyStore'
import { useSRSStore } from '@/store/srsStore'
import type { StudyMode } from '@/lib/database.types'
import FlashCard from '@/components/cards/FlashCard'
import MultipleChoiceCard from '@/components/cards/MultipleChoiceCard'
import TypedAnswerCard from '@/components/cards/TypedAnswerCard'
import styles from './StudyPage.module.css'

const MODES: { id: StudyMode; label: string; desc: string }[] = [
  { id: 'flashcard', label: 'Flashcards', desc: 'Flip and self-assess' },
  { id: 'multiple_choice', label: 'Multiple choice', desc: 'Pick the right answer' },
  { id: 'typed', label: 'Typed answer', desc: 'Write the definition' },
]
const TIMER_OPTS = [{ label: '1 min', mins: 1 }, { label: '3 min', mins: 3 }, { label: '5 min', mins: 5 }, { label: '10 min', mins: 10 }]

export default function StudyPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { currentSet, fetchSet } = useSetsStore()
  const { fetchSRS } = useSRSStore()
  const { mode, sessionCards, currentIndex, known, unknown, isComplete, timerSecsLeft, timerOn, mcStreak, startSession, markKnown, markUnknown, resetSession, tickTimer, selectMCOption, reshuffleRemaining } = useStudyStore()

  const [selecting, setSelecting] = useState(true)
  const [selectedMode, setSelectedMode] = useState<StudyMode>('flashcard')
  const [doShuffle, setDoShuffle] = useState(false)
  const [timerEnabled, setTimerEnabled] = useState(false)
  const [timerDur, setTimerDur] = useState(5)
  const [milestoneMsg, setMilestoneMsg] = useState<string | null>(null)
  const [burstMsg, setBurstMsg] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const shownMilestones = useRef(new Set<number>())

  useEffect(() => {
    if (id) { fetchSet(id); fetchSRS(id) }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [id])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return
      if (selecting || isComplete) return
      if (mode === 'flashcard') {
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

  useEffect(() => {
    if (!isComplete && timerOn && !selecting) {
      timerRef.current = setInterval(() => tickTimer(), 1000)
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [timerOn, selecting, isComplete])

  // Reset milestones on new session
  useEffect(() => { shownMilestones.current = new Set() }, [sessionCards.length])

  // MC streak burst — fires whenever mcStreak hits a multiple of 5
  const BURST_MSGS = ['On a roll!', 'Unstoppable!', 'On fire!', 'Legendary!']
  useEffect(() => {
    if (mcStreak === 0 || mcStreak % 5 !== 0) return
    const idx = Math.floor(mcStreak / 5) - 1
    setBurstMsg(BURST_MSGS[Math.min(idx, BURST_MSGS.length - 1)])
    setTimeout(() => setBurstMsg(null), 2000)
  }, [mcStreak])

  // Milestone toasts
  useEffect(() => {
    if (sessionCards.length === 0 || isComplete || mode !== 'flashcard') return
    const pct = (known.length / sessionCards.length) * 100
    const checks: [number, string][] = [[25, 'Good start!'], [50, 'Halfway there!'], [75, 'Almost done!']]
    for (const [thresh, msg] of checks) {
      if (pct >= thresh && !shownMilestones.current.has(thresh)) {
        shownMilestones.current.add(thresh)
        setMilestoneMsg(msg)
        setTimeout(() => setMilestoneMsg(null), 2000)
        break
      }
    }
  }, [known.length])

  const canMC = (currentSet?.cards?.length ?? 0) >= 4

  const handleStart = () => {
    if (!currentSet?.cards?.length || !id) return
    startSession(currentSet.cards, selectedMode, id, { shuffle: doShuffle, timerDurMin: timerEnabled ? timerDur : 0 })
    setSelecting(false)
  }

  const handleEnd = () => { resetSession(); setSelecting(true) }

  const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60 < 10 ? '0' : '')}${s % 60}`

  if (!currentSet) return <div className={styles.loading}>Loading…</div>

  if (selecting) return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={() => navigate(`/sets/${id}`)}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M10 3L5 8l5 5"/></svg>
          {currentSet.title}
        </button>
      </div>
      <div className={styles.modeSelector}>
        <div className={styles.modeSelectorTitle}>Choose a study mode</div>
        <div className={styles.modeOptions}>
          {MODES.map((m) => {
            const disabled = m.id === 'multiple_choice' && !canMC
            return <button key={m.id} className={[styles.modeOption, selectedMode === m.id ? styles.modeSelected : '', disabled ? styles.modeDisabled : ''].join(' ')} onClick={() => !disabled && setSelectedMode(m.id)} disabled={disabled}><div className={styles.modeLabel}>{m.label}</div><div className={styles.modeDesc}>{disabled ? 'Needs 4+ cards' : m.desc}</div></button>
          })}
        </div>
        <div className={styles.sessionOpts}>
          <button className={[styles.sessionOpt, doShuffle ? styles.sessionOptActive : ''].join(' ')} onClick={() => setDoShuffle(!doShuffle)}>
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M1 4h9m0 0l-2-2m2 2l-2 2M14 11H5m0 0l2-2m-2 2l2 2"/></svg>
            <div><div className={styles.sessionOptLabel}>Shuffle</div><div className={styles.sessionOptDesc}>Random order</div></div>
          </button>
          <button className={[styles.sessionOpt, timerEnabled ? styles.sessionOptActive : ''].join(' ')} onClick={() => setTimerEnabled(!timerEnabled)}>
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="7.5" cy="8" r="5"/><path d="M7.5 5.5V8l2 1.5M5.5 1.5h4"/></svg>
            <div><div className={styles.sessionOptLabel}>Timer</div><div className={styles.sessionOptDesc}>{timerEnabled ? `${timerDur} min` : 'Off'}</div></div>
          </button>
        </div>
        {timerEnabled && (
          <div className={styles.timerPicker}>
            {TIMER_OPTS.map((t) => <button key={t.mins} className={[styles.timerOpt, timerDur === t.mins ? styles.timerOptSelected : ''].join(' ')} onClick={() => setTimerDur(t.mins)}>{t.label}</button>)}
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
            {pct === 100 ? <PerfectScore total={total} known={k} unknown={u} /> : <CountUpScore pct={pct} total={total} known={k} unknown={u} />}
            <div className={styles.summaryActions}>
              <button className={styles.retryBtn} onClick={() => startSession(currentSet.cards, mode, id!, { shuffle: doShuffle, timerDurMin: timerEnabled ? timerDur : 0 })}>Study again</button>
              <button className={styles.changeModeBtn} onClick={handleEnd}>Change mode</button>
              <Link to={`/sets/${id}`} className={styles.doneBtn}>Back to set</Link>
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
          {currentSet.title}
        </button>
        <div className={styles.topBarRight}>
          {(mode === 'flashcard' || mode === 'multiple_choice') && (
            <button className={styles.shuffleBtn} onClick={reshuffleRemaining} title="Shuffle remaining cards">
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M1 4h9m0 0l-2-2m2 2l-2 2M14 11H5m0 0l2-2m-2 2l2 2"/></svg>
            </button>
          )}
          <div className={styles.modeTag}>{MODES.find((m) => m.id === mode)?.label}</div>
          <button className={styles.exitBtn} onClick={handleEnd}>End session</button>
        </div>
      </div>
      <div className={styles.progressRow}>
        <div className={styles.progressTrack}><div className={styles.progressFill} style={{ width: `${(currentIndex / sessionCards.length) * 100}%` }} /></div>
        <span className={styles.progressLabel}>{currentIndex + 1} / {sessionCards.length}</span>
      </div>
      {mode === 'flashcard' && <FlashCard card={sessionCards[currentIndex]} index={currentIndex} total={sessionCards.length} onKnow={markKnown} onDontKnow={markUnknown} />}
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
      {milestoneMsg && <div className={styles.milestoneToast}>{milestoneMsg}</div>}
      {burstMsg && <StreakBurst msg={burstMsg} streak={mcStreak} />}
    </div>
  )
}

export function StreakBurst({ msg, streak }: { msg: string; streak: number }) {
  return (
    <div className={styles.burstOverlay}>
      <div className={styles.burstRing} />
      <div className={styles.burstRing2} />
      <div className={styles.burstContent}>
        <div className={styles.burstStreak}>{streak} in a row</div>
        <div className={styles.burstMsg}>{msg}</div>
      </div>
    </div>
  )
}

export function CountUpScore({ pct, total, known, unknown }: { pct: number; total: number; known: number; unknown: number }) {
  const [display, setDisplay] = useState(0)
  const [bar, setBar] = useState(0)
  useEffect(() => {
    const dur = 1100, start = performance.now()
    const tick = (now: number) => { const t = Math.min(1, (now - start) / dur); const e = t < 0.5 ? 2 * t * t : (4 - 2 * t) * t - 1; setDisplay(Math.round(e * pct)); if (t < 1) requestAnimationFrame(tick); else { setDisplay(pct); setBar(pct) } }
    requestAnimationFrame(tick)
    setTimeout(() => setBar(pct), 50)
  }, [])
  return (
    <>
      <div className={styles.countScore}>{display}%</div>
      <div className={styles.countBarTrack}><div className={styles.countBarFill} style={{ width: `${bar}%`, transition: 'width 1.1s cubic-bezier(0.4,0,0.2,1)' }} /></div>
      <div className={styles.summaryTitle}>{pct >= 70 ? 'Great progress' : 'Keep going'}</div>
      <div className={styles.summaryMeta}>{known} known · {unknown} still learning</div>
      <SummaryBars total={total} known={known} unknown={unknown} />
    </>
  )
}

export function PerfectScore({ total, known, unknown }: { total: number; known: number; unknown: number }) {
  const FINAL = ['rotate(-14deg) translate(-55px,6px)', 'rotate(7deg) translate(6px,-20px)', 'rotate(-5deg) translate(48px,4px)', 'rotate(11deg) translate(-16px,24px)', 'rotate(-2deg) translate(26px,-8px)']
  useEffect(() => {
    for (let i = 1; i <= 5; i++) { const el = document.getElementById(`pfc${i}`); if (!el) continue; el.style.transition = 'none'; el.style.opacity = '0'; el.style.transform = 'translateY(60px) scale(0.85)' }
    const stamp = document.getElementById('pstamp'); if (stamp) { stamp.style.transition = 'none'; stamp.style.opacity = '0'; stamp.style.transform = 'translate(-50%,-50%) scale(2.2) rotate(-8deg)' }
    for (let i = 1; i <= 5; i++) { const el = document.getElementById(`pfc${i}`); if (!el) continue; setTimeout(() => { el.style.transition = 'all 0.38s cubic-bezier(0.34,1.4,0.64,1)'; el.style.opacity = '1'; el.style.transform = FINAL[i - 1] }, (i - 1) * 75) }
    setTimeout(() => { const s = document.getElementById('pstamp'); if (!s) return; s.style.transition = 'opacity 0.08s ease, transform 0.22s cubic-bezier(0.22,1.8,0.36,1)'; s.style.opacity = '1'; s.style.transform = 'translate(-50%,-50%) scale(1) rotate(-4deg)'; setTimeout(() => { s.style.transition = 'transform 0.12s ease'; s.style.transform = 'translate(-50%,-50%) scale(1) rotate(-3deg)' }, 220) }, 480)
  }, [])
  return (
    <>
      <div className={styles.stackScene}>
        {[1,2,3,4,5].map((i) => <div key={i} id={`pfc${i}`} className={styles.flyCard}>Got it</div>)}
        <div className={styles.stampWrap} id="pstamp"><div className={styles.stampInner}><div className={styles.stampPct}>100%</div><div className={styles.stampLabel}>Perfect</div></div></div>
      </div>
      <div className={styles.summaryTitle}>Perfect round!</div>
      <div className={styles.summaryMeta}>{known} of {total} cards correct</div>
      <SummaryBars total={total} known={known} unknown={unknown} />
    </>
  )
}

function SummaryBars({ total, known, unknown }: { total: number; known: number; unknown: number }) {
  const [m, setM] = useState(false)
  useEffect(() => { setTimeout(() => setM(true), 200) }, [])
  return (
    <div className={styles.summaryBars}>
      <div className={styles.barRow}><span className={styles.barLabel}>Got it</span><div className={styles.barTrack}><div className={styles.barGreen} style={{ width: m && total > 0 ? `${(known/total)*100}%` : '0%' }} /></div><span className={styles.barCount}>{known}</span></div>
      <div className={styles.barRow}><span className={styles.barLabel}>Still learning</span><div className={styles.barTrack}><div className={styles.barRed} style={{ width: m && total > 0 ? `${(unknown/total)*100}%` : '0%' }} /></div><span className={styles.barCount}>{unknown}</span></div>
    </div>
  )
}
