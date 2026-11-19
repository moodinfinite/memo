import { useEffect, useState } from 'react'
import { reducedMotion, revealDelay } from '@/lib/laneSeen'

/**
 * Steps the alley's lights on from `start` up to `target`: quickly through lights already `seen`, then
 * one by one through new ones. `fresh` is the newest light revealed this time, for its flicker and glow.
 */
export function useLightReveal(target: number | null, seen: number | null, start = 0) {
  const [shown, setShown] = useState(start)
  const [reduce] = useState(reducedMotion)
  const t = target ?? 0
  const s = Math.min(seen ?? t, t)
  const visible = target == null ? 0 : reduce ? t : Math.min(shown, t)

  useEffect(() => {
    if (target == null || reduce) return
    const delay = revealDelay(visible, s, target, start)
    if (delay == null) return
    const id = setTimeout(() => setShown(x => Math.min(x, target) + 1), delay)
    return () => clearTimeout(id)
  }, [visible, target, s, start, reduce])

  const ready = target != null && visible >= t
  return { visible, ready, fresh: visible > s && visible > start ? visible - 1 : null, newLights: Math.max(0, t - Math.max(s, start)) }
}
