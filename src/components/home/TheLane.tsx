import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { levelName } from '@/lib/levelTest'
import { laneThreshold } from '@/lib/lane'
import { pathLights, sectionPlace, unitsForLight, STAGE_PART, SECTIONS, THEMES } from '@/lib/path'
import { usePath } from '@/lib/usePath'
import { readSeen, writeSeen } from '@/lib/laneSeen'
import { LANE_ITEMS } from './laneScene'
import AlleyScene, { LANE_N as N } from './AlleyScene'
import { useLightReveal } from './useLightReveal'
import styles from './TheLane.module.css'

const PROGRESS_SECTIONS = 5
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const units = (n: number) => `${n} more unit${n === 1 ? '' : 's'}`
const shortMeaning = (m: string) => m.replace(/\s*\([^)]*\)/g, '').split(/[;/]/).map(s => s.trim()).filter(Boolean).slice(0, 2).join('; ')
const theme = (t: string) => (THEMES[t] ?? THEMES.general).en

/**
 * The Lane (beta): a dusk alley on Home whose lights come on as the learner finishes units on their
 * learning path. It follows the level they are on; the last light needs every unit of that level.
 */
export default function TheLane() {
  const { user, failed, reload, start, levels, onLevel } = usePath()
  const [open, setOpen] = useState<number | null>(null)
  const [explain, setExplain] = useState(false)

  const stage = onLevel && !onLevel.complete ? onLevel.stages[onLevel.current] : 'skip'
  const lights = onLevel ? pathLights(onLevel.units.length, onLevel.doneCount, STAGE_PART[stage], N) : null
  const target = lights?.lit ?? 0

  // Lights you've already watched come on, read once per level: new ones (earned by a test-out, or
  // while the path's "unit done" moment was skipped) are saved for last, one at a time
  const seenAt = useRef<{ key: string; n: number } | null>(null)
  const seenKey = user && onLevel ? `${user.id}:${onLevel.level}` : null
  if (seenKey && lights && seenAt.current?.key !== seenKey) seenAt.current = { key: seenKey, n: readSeen(user!.id, onLevel!.level) ?? target }
  const seenLights = seenKey && seenAt.current?.key === seenKey ? seenAt.current.n : null

  // Every visit the street comes alive: lights switch on one by one up to your progress
  const { visible: shown, ready: revealed, fresh, newLights } = useLightReveal(lights ? target : null, seenLights)
  const ready = !!lights && revealed
  useEffect(() => { if (ready && user && onLevel) writeSeen(user.id, onLevel.level, target) }, [ready, target, user?.id, onLevel?.level])

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
  else if (ready && newLights > 0 && target > 0) line = <><b>{cap(LANE_ITEMS[target - 1].name)}</b> just came on!{newLights > 1 ? ` That’s ${newLights} new lights.` : ''}{next && lights ? ` ${units(lights.toNext)} and ${next.name} comes on.` : ''}</>
  else if (next && lights) line = <>歡迎回來！{units(lights.toNext)} and {next.name} comes on.</>

  const item = open != null ? LANE_ITEMS[open] : null
  const litUnits = open != null && onLevel && lights && open < lights.lit ? unitsForLight(onLevel.units, open, N) : null
  const litWords = litUnits && onLevel ? litUnits.flatMap(u => u.words.filter((_, j) => onLevel.states[u.index][j] !== 'new')) : []

  return <section className={styles.lane} aria-label="The Lane (beta)">
    <h1 className={styles.srOnly}>Home</h1>
    <div className={styles.stage}>
      <AlleyScene shown={shown} warmth={warmth} fresh={fresh} onItem={setOpen} label={lights ? `A street at dusk with ${lights.lit} of ${N} lights on` : 'A street at dusk'} />
      <p className={styles.auntie} aria-live="polite"><b>Auntie</b> · {line}</p>
      {item && <div className={styles.popover} role="dialog" aria-label={item.name}>
        <div className={styles.popHead}><strong>{item.name}</strong><button type="button" onClick={() => setOpen(null)} aria-label="Close">✕</button></div>
        {litUnits
          ? <><p className={styles.popSub}>Switched on by {litUnits.map(u => `${SECTIONS[u.section].toLowerCase()} unit ${sectionPlace(onLevel!.units, u).n} (${theme(u.theme)})`).join(', ')}</p>
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
          {start === null ? <Link to="/path" className={styles.go}>Start your path →</Link>
            : unit ? <Link to="/path?go=1" className={styles.go}>Unit {onLevel ? sectionPlace(onLevel.units, unit).n : unit.index + 1} · {theme(unit.theme)} →</Link>
            : <Link to="/path" className={styles.go}>Open your path →</Link>}
        </span>
      </div>
      {explain && <p className={styles.explain}>Each unit you finish on your path (sort the words, learn the new ones, pass the check) moves the alley forward. {lights && onLevel ? `About every ${lights.per} units switch on another light, from Auntie’s stall to the far blocks, and the last light needs all ${onLevel.units.length} units of ${levelName(onLevel.level)}. ` : ''}A unit you’re partway through warms the next light. Beta: the street and its pace may change.</p>}
    </div>
  </section>
}
