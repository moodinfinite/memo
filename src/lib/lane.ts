import type { CardSRS } from '@/store/srsStore'
import type { ListWord } from './levelTest'
import { getMasteryLevel } from './mastery'

/**
 * The Lane (beta): a dusk street on Home whose lights come on as the learner's TOCFL Level 3
 * words become Familiar in their own sets. Words come from whatever they import; the official
 * list only decides which words count.
 */
export const LANE_LEVEL = 3
/** Mastery level a word needs before it counts toward a light: right on two different days */
export const LANE_COUNTS_AT = 2

const han = /\p{Script=Han}/u
export const hanOnly = (text: string) => [...text].filter(ch => han.test(ch)).join('')

export interface LaneWord { form: string; pinyin: string; meaning: string }
export interface LaneProgress {
  /** Level 3 words on the official list */
  total: number
  /** Level 3 words in the learner's sets at Familiar or above, oldest study first */
  familiar: LaneWord[]
  /** Level 3 words studied but not yet Familiar */
  started: number
}

interface CardLike { id: string; term: string; definition: string }

/** Every Chinese form a card offers: the whole field and each part split on common separators */
function cardForms(card: CardLike): string[] {
  const out: string[] = []
  for (const field of [card.term, card.definition]) {
    for (const part of [field, ...field.split(/[\/／,，;；、|()（）]/)]) {
      const form = hanOnly(part)
      if (form && !out.includes(form)) out.push(form)
    }
  }
  return out
}

export function laneProgress(list: ListWord[], cards: CardLike[], srs: Record<string, CardSRS>): LaneProgress {
  const byForm = new Map<string, ListWord>()
  const words = list.filter(w => w.level === LANE_LEVEL)
  for (const w of words) for (const f of w.forms) if (!byForm.has(f)) byForm.set(f, w)

  const best = new Map<ListWord, { level: number; seen: string }>()
  for (const card of cards) {
    const word = cardForms(card).map(f => byForm.get(f)).find(Boolean)
    if (!word) continue
    const record = srs[card.id]
    const level = getMasteryLevel(record)
    const prev = best.get(word)
    if (!prev || level > prev.level) best.set(word, { level, seen: record?.last_seen_at ?? '' })
  }

  const familiar = [...best].filter(([, b]) => b.level >= LANE_COUNTS_AT)
    .sort((a, b) => a[1].seen.localeCompare(b[1].seen))
    .map(([w]) => ({ form: w.forms[0], pinyin: w.pinyin, meaning: w.meaning }))
  const started = [...best.values()].filter(b => b.level >= 1 && b.level < LANE_COUNTS_AT).length
  return { total: words.length, familiar, started }
}

/** Familiar words needed for light `index` (0-based); spread evenly so the last light needs every word */
export const laneThreshold = (total: number, lights: number, index: number) =>
  index < 0 ? 0 : Math.max(index + 1, Math.ceil((index + 1) * total / lights))

export interface LaneLights {
  /** Roughly how many words each light takes */
  per: number
  lit: number
  /** 0–0.9 glow on the next light; started words count half */
  warmth: number
  /** Familiar words still needed for the next light (0 when all are lit) */
  toNext: number
}

export function laneLights(p: LaneProgress, lights: number): LaneLights {
  const per = Math.max(1, Math.round(p.total / lights))
  const count = p.familiar.length
  let lit = 0
  while (lit < lights && count >= laneThreshold(p.total, lights, lit)) lit++
  if (lit >= lights) return { per, lit, warmth: 0, toNext: 0 }
  const from = laneThreshold(p.total, lights, lit - 1), to = laneThreshold(p.total, lights, lit)
  return { per, lit, warmth: Math.min(0.9, (count - from + p.started * 0.5) / (to - from)), toNext: to - count }
}

/** The words that switched on light `index` */
export const wordsForLight = (p: LaneProgress, index: number, lights: number) =>
  p.familiar.slice(laneThreshold(p.total, lights, index - 1), laneThreshold(p.total, lights, index))
