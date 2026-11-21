import { useEffect, useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { reducedMotion, writeSeen } from '@/lib/laneSeen'
import { pathLights, STAGE_PART } from '@/lib/path'
import type { PathLevel } from '@/lib/usePath'
import AlleyScene, { LANE_N as N } from './AlleyScene'
import styles from './TheLane.module.css'


/**
 * One beat at a time, so nothing overlaps: the alley as it was, a slow zoom to the light at stake,
 * the light switching on (or the next one warming), a moment to take it in, then back out.
 */
const BEAT = { zoom: 300, on: 1800, warm: 3000, out: 4100 }
/** Extra lights from a test-out come on in quick succession before the last one */
const STEP_MS = 160
type Beat = 'still' | 'zoom' | 'on' | 'warm' | 'out'

interface Props {
  level: PathLevel
  /** Where the level stood before this unit or test-out: units done, and how far the unit in hand had got */
  before: { done: number; part: number }
}

/**
 * The payoff on the path's "unit done" screen: the light this unit earned switching on, or the next
 * light warming if it needs more units. Can be replayed; marks the light seen so Home doesn't replay it.
 */
export default function LaneReveal({ level, before }: Props) {
  const user = useAuthStore(s => s.user)
  const from = pathLights(level.units.length, before.done, before.part, N)
  const stage = level.complete ? 'skip' : level.stages[level.current]
  const after = pathLights(level.units.length, level.doneCount, STAGE_PART[stage], N)
  const target = Math.max(after.lit, from.lit)
  const earned = target > from.lit
  const extra = Math.max(0, target - from.lit - 1) * STEP_MS

  const [run, setRun] = useState(0)
  const [beat, setBeat] = useState<Beat>('still')
  const [shown, setShown] = useState(from.lit)
  useEffect(() => {
    setShown(from.lit)
    if (reducedMotion()) { setBeat('out'); setShown(target); return }
    setBeat('still')
    const ids = [
      setTimeout(() => setBeat('zoom'), BEAT.zoom),
      setTimeout(() => setBeat('on'), BEAT.on),
      setTimeout(() => setBeat('warm'), BEAT.warm + extra),
      setTimeout(() => setBeat('out'), BEAT.out + extra),
    ]
    return () => ids.forEach(clearTimeout)
  }, [run])

  const lit = beat === 'on' || beat === 'warm' || beat === 'out'
  // Switch the earned lights on, the last with its flicker
  useEffect(() => {
    if (!lit || shown >= target) return
    const id = setTimeout(() => setShown(s => Math.min(target, s + 1)), shown === from.lit ? 0 : STEP_MS)
    return () => clearTimeout(id)
  }, [lit, shown, target])
  useEffect(() => { if (lit && user) writeSeen(user.id, level.level, target) }, [lit, target, user?.id, level.level])

  const focusOn = earned ? target - 1 : target < N ? target : null
  const warmth = beat === 'warm' || beat === 'out' ? after.warmth : shown === from.lit ? from.warmth : 0

  return <div className={styles.lane}>
    <div className={styles.stage}>
      <AlleyScene shown={shown} warmth={warmth} fresh={earned && lit && shown >= target ? target - 1 : null}
        focus={beat === 'zoom' || beat === 'on' || beat === 'warm' ? focusOn : null}
        label={`The alley with ${shown} of ${N} lights on`} />
      {beat === 'out' && !reducedMotion() && <button type="button" className={styles.replay} onClick={() => setRun(r => r + 1)}>↻ Replay</button>}
    </div>
  </div>
}
