import { useEffect, useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { writeSeen } from '@/lib/laneSeen'
import { pathLights, STAGE_PART } from '@/lib/path'
import type { PathLevel } from '@/lib/usePath'
import { LANE_ITEMS } from './laneScene'
import AlleyScene, { LANE_N as N } from './AlleyScene'
import { useLightReveal } from './useLightReveal'
import styles from './TheLane.module.css'

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const units = (n: number) => `${n} more unit${n === 1 ? '' : 's'}`

interface Props {
  level: PathLevel
  /** Where the level stood before this unit or test-out: units done, and how far the unit in hand had got */
  before: { done: number; part: number }
}

/**
 * The payoff on the path's "unit done" screen: the alley as it was, then the light this unit earned
 * flickering on, or the next light warming if it needs more units. Marks the light seen so Home
 * doesn't play it again.
 */
export default function LaneReveal({ level, before }: Props) {
  const user = useAuthStore(s => s.user)
  const from = pathLights(level.units.length, before.done, before.part, N)
  const stage = level.complete ? 'skip' : level.stages[level.current]
  const after = pathLights(level.units.length, level.doneCount, STAGE_PART[stage], N)
  const target = Math.max(after.lit, from.lit)
  const { visible, ready, fresh } = useLightReveal(target, from.lit, from.lit)
  const earned = target > from.lit

  // Zoom in on the light at stake, warm the next one once the new light is on, then pull back
  const [beat, setBeat] = useState(0)
  useEffect(() => { const id = setTimeout(() => setBeat(1), 250); return () => clearTimeout(id) }, [])
  useEffect(() => {
    if (!ready || beat < 1) return
    const ids = [setTimeout(() => setBeat(b => Math.max(b, 2)), 500), setTimeout(() => setBeat(3), 2800)]
    return () => ids.forEach(clearTimeout)
  }, [ready, beat >= 1])
  useEffect(() => { if (ready && user) writeSeen(user.id, level.level, target) }, [ready, target, user?.id, level.level])

  const focusOn = earned ? target - 1 : target < N ? target : null
  const warmth = beat >= 2 ? after.warmth : visible === from.lit ? from.warmth : 0
  const next = target < N ? LANE_ITEMS[target] : null

  let line: React.ReactNode = '…'
  if (ready && earned && target >= N) line = <>整條巷子都亮了！<b>{cap(LANE_ITEMS[N - 1].name)}</b> just came on.</>
  else if (ready && earned) line = <><b>{cap(LANE_ITEMS[target - 1].name)}</b> just came on!{next ? ` ${units(after.toNext)} until ${next.name}.` : ''}</>
  else if (ready && next) line = <>{units(after.toNext)} until <b>{next.name}</b>.</>

  return <div className={styles.lane}>
    <div className={styles.stage}>
      <AlleyScene shown={visible} warmth={warmth} fresh={fresh} focus={beat >= 1 && beat < 3 ? focusOn : null}
        label={`The alley with ${visible} of ${N} lights on`} />
      <p className={styles.auntie} aria-live="polite"><b>Auntie</b> · {line}</p>
    </div>
  </div>
}
