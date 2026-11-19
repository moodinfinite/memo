import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { levelName } from '@/lib/levelTest'
import { laneThreshold } from '@/lib/lane'
import { pathLights, unitsForLight, STAGE_PART, THEMES } from '@/lib/path'
import { usePath } from '@/lib/usePath'
import { LANE_ITEMS, LANE_CAT, LANE_TRAIN, C, laneBack, laneLabels } from './laneScene'
import styles from './TheLane.module.css'

const BACK = laneBack()
const LABELS = laneLabels()
const N = LANE_ITEMS.length
const PROGRESS_SECTIONS = 5
const units = (n: number) => `${n} more unit${n === 1 ? '' : 's'}`
const shortMeaning = (m: string) => m.replace(/\s*\([^)]*\)/g, '').split(/[;/]/).map(s => s.trim()).filter(Boolean).slice(0, 2).join('; ')
const theme = (t: string) => (THEMES[t] ?? THEMES.general).en
const reducedMotion = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false } }

/**
 * The Lane (beta): a dusk alley on Home whose lights come on as the learner finishes units on their
 * learning path. It follows the level they are on; the last light needs every unit of that level.
 */
export default function TheLane() {
  const { failed, reload, start, levels, onLevel } = usePath()
  const [shown, setShown] = useState(0)
  const [open, setOpen] = useState<number | null>(null)
  const [explain, setExplain] = useState(false)

  const stage = onLevel && !onLevel.complete ? onLevel.stages[onLevel.current] : 'skip'
  const lights = onLevel ? pathLights(onLevel.units.length, onLevel.doneCount, STAGE_PART[stage], N) : null
  const target = lights?.lit ?? 0

  // Every visit the street comes alive: lights switch on one by one up to your progress
  useEffect(() => {
    if (!lights) return
    if (reducedMotion()) { setShown(target); return }
    setShown(s => Math.min(s, target))
    const step = Math.max(60, Math.min(140, 2600 / Math.max(1, target)))
    let timer: ReturnType<typeof setInterval> | undefined
    const begin = setTimeout(() => { timer = setInterval(() => setShown(s => (s >= target ? s : s + 1)), step) }, 350)
    return () => { clearTimeout(begin); clearInterval(timer) }
  }, [target, !!lights])

  const ready = !!lights && shown >= target
  const warmth = ready && lights ? lights.warmth : 0
  const next = lights && lights.lit < N ? LANE_ITEMS[lights.lit] : null
  const unit = onLevel && !onLevel.complete ? onLevel.units[onLevel.current] : null
  const nextLevel = onLevel ? levels.find(l => l.level > onLevel.level && !l.complete) : undefined

  let line: React.ReactNode
  if (failed) line = <>The lane didn’t load. <button type="button" className={styles.inline} onClick={reload}>Try again</button></>
  else if (start === null) line = '天黑了… Start your path and every unit you finish lights this alley.'
  else if (!onLevel) line = '天黑了… opening up the lane.'
  else if (onLevel.complete) line = <>整條巷子都亮了！{levelName(onLevel.level)} is done.{nextLevel ? ` ${levelName(nextLevel.level)} is next on your path.` : ''}</>
  else if (onLevel.doneCount === 0 && stage === 'sweep') line = '天黑了… Each unit you finish on your path switches on a light.'
  else if (next && lights) line = <>歡迎回來！{units(lights.toNext)} and {next.name} comes on.</>

  const item = open != null ? LANE_ITEMS[open] : null
  const litUnits = open != null && onLevel && lights && open < lights.lit ? unitsForLight(onLevel.units, open, N) : null
  const litWords = litUnits && onLevel ? litUnits.flatMap(u => u.words.filter((_, j) => onLevel.states[u.index][j] !== 'new')) : []

  return <section className={styles.lane} aria-label="The Lane (beta)">
    <h1 className={styles.srOnly}>Home</h1>
    <div className={styles.stage}>
      <svg viewBox="0 0 1600 900" className={styles.svg} role="img" aria-label={lights ? `A street at dusk with ${lights.lit} of ${N} lights on` : 'A street at dusk'}>
        <g dangerouslySetInnerHTML={{ __html: BACK }} />
        <g className={styles.cat} style={{ opacity: shown >= N / 2 ? 1 : 0 }} fill="#f2efe8" stroke={C.ink} strokeWidth="2" dangerouslySetInnerHTML={{ __html: LANE_CAT }} />
        <g>{LANE_ITEMS.map((it, i) => {
          if (!it.pool) return null
          const [cx, cy, rx, ry] = it.pool
          const o = i < shown ? 1 : i === shown ? warmth * 0.35 : 0
          return <ellipse key={i} className={styles.pool} cx={cx} cy={cy} rx={rx} ry={ry} fill={`url(#${it.kind === 'cool' ? 'lanePoolCool' : 'lanePoolWarm'})`} style={{ opacity: o }} />
        })}</g>
        <g>{LANE_ITEMS.map((it, i) => {
          if (it.kind === 'train') return null
          const on = i < shown
          return <g key={i} className={`${styles.item} ${on ? styles.on : ''} ${it.kind === 'cool' ? styles.cool : ''}`} onClick={() => setOpen(i)}>
            <g fill={it.dim} stroke={C.ink} strokeWidth="2" dangerouslySetInnerHTML={{ __html: it.geo }} />
            <g className={styles.lit} fill={it.lit} stroke={C.ink} strokeWidth="2" style={on ? undefined : { opacity: i === shown ? warmth * 0.35 : 0 }} dangerouslySetInnerHTML={{ __html: it.geo }} />
          </g>
        })}</g>
        <g clipPath="url(#laneGap)"><g className={styles.trainWrap} style={{ opacity: LANE_ITEMS.findIndex(it => it.kind === 'train') < shown ? 1 : 0 }}>
          <g className={styles.train} dangerouslySetInnerHTML={{ __html: LANE_TRAIN }} />
        </g></g>
        <g style={{ pointerEvents: 'none' }} dangerouslySetInnerHTML={{ __html: LABELS }} />
      </svg>
      <p className={styles.auntie} aria-live="polite"><b>Auntie</b> · {line}</p>
      {item && <div className={styles.popover} role="dialog" aria-label={item.name}>
        <div className={styles.popHead}><strong>{item.name}</strong><button type="button" onClick={() => setOpen(null)} aria-label="Close">✕</button></div>
        {litUnits
          ? <><p className={styles.popSub}>Switched on by {litUnits.map(u => `unit ${u.index + 1} (${theme(u.theme)})`).join(', ')}</p>
            {litWords.length > 0 && <ul className={styles.words}>{litWords.slice(0, 12).map(w => <li key={w.forms[0]}><b lang="zh-Hant">{w.forms[0]}</b> {w.pinyin} · {shortMeaning(w.meaning)}</li>)}</ul>}</>
          : <p className={styles.popSub}>Still dark.{onLevel && open != null ? ` It comes on after ${units(Math.max(1, laneThreshold(onLevel.units.length, N, open) - onLevel.doneCount))}.` : ''}</p>}
      </div>}
    </div>
    <div className={styles.strip}>
      <div className={styles.milestones} role="progressbar" aria-label={onLevel ? `${levelName(onLevel.level)} path units` : 'Path units'}
        aria-valuemin={0} aria-valuemax={onLevel?.units.length || undefined} aria-valuenow={onLevel?.doneCount}
        aria-valuetext={onLevel ? `${onLevel.doneCount} of ${onLevel.units.length} units done` : 'Loading your path'}>
        {Array.from({ length: PROGRESS_SECTIONS }, (_, i) => {
          const fraction = onLevel?.units.length ? onLevel.doneCount / onLevel.units.length : 0
          const fill = Math.max(0, Math.min(1, fraction * PROGRESS_SECTIONS - i))
          return <span key={i} aria-hidden="true"><i style={{ width: `${fill * 100}%` }} /></span>
        })}
      </div>
      <div className={styles.stripRow}>
        <span className={styles.count}>{onLevel ? <><strong>{onLevel.doneCount}</strong> / {onLevel.units.length} units · {levelName(onLevel.level)}</> : start === null ? 'No path yet' : 'Finding your place…'}</span>
        <span className={styles.actions}>
          <button type="button" className={styles.inline} onClick={() => setExplain(e => !e)} aria-expanded={explain}>How it lights</button>
          <Link to="/lane/lesson" className={styles.inline}>Daily practice</Link>
          {start === null ? <Link to="/path" className={styles.go}>Start your path →</Link>
            : unit ? <Link to="/path?go=1" className={styles.go}>Unit {unit.index + 1} · {theme(unit.theme)} →</Link>
            : <Link to="/path" className={styles.go}>Open your path →</Link>}
        </span>
      </div>
      {explain && <p className={styles.explain}>Each unit you finish on your path (sort the words, learn the new ones, pass the check) moves the alley forward. {lights && onLevel ? `About every ${lights.per} units switch on another light, from Auntie’s stall to the far blocks, and the last light needs all ${onLevel.units.length} units of ${levelName(onLevel.level)}. ` : ''}A unit you’re partway through warms the next light. Daily practice keeps your reviews going but doesn’t move the alley. Beta: the street and its pace may change.</p>}
    </div>
  </section>
}
