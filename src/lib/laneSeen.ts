/**
 * Which alley lights the learner has already watched come on, per level, on this device. Home replays
 * lights already seen quickly and saves the slow, one-at-a-time flicker for lights that are new.
 */
const key = (user: string, level: number) => `memo-lane-seen:${user}:${level}`

export function readSeen(user: string, level: number): number | null {
  try {
    const n = Number(localStorage.getItem(key(user, level)))
    return localStorage.getItem(key(user, level)) !== null && Number.isFinite(n) && n >= 0 ? n : null
  } catch { return null }
}

export function writeSeen(user: string, level: number, lights: number) {
  try { localStorage.setItem(key(user, level), String(lights)) } catch { /* private mode: replays are harmless */ }
}

/** Timings in ms. Only the last few new lights get the slow reveal, so a big test-out doesn't drag. */
export const REVEAL = { first: 350, fastMin: 60, fastMax: 140, pause: 700, slow: 1100, slowLights: 3 }

/**
 * How long to wait before switching on the next light, or null when every light is on. Lights up to
 * `seen` come on quickly from `start`; then a pause, then each new light on its own.
 */
export function revealDelay(shown: number, seen: number, target: number, start = 0): number | null {
  if (shown >= target) return null
  const quickUntil = Math.max(seen, target - REVEAL.slowLights)
  if (shown < quickUntil) return shown === start ? REVEAL.first : Math.max(REVEAL.fastMin, Math.min(REVEAL.fastMax, 2600 / Math.max(1, quickUntil)))
  return shown === quickUntil ? REVEAL.pause : REVEAL.slow
}

export const reducedMotion = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false } }
