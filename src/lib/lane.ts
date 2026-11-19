import type { CardSRS } from '@/store/srsStore'
import type { ListWord } from './levelTest'
import { stableId } from './stableId'
import { getMasteryLevel } from './mastery'

/**
 * The Lane (beta): a dusk street on Home whose lights come on as the learner's TOCFL Level 3
 * words become Familiar through path lessons or matching personal cards.
 */
export const LANE_LEVEL = 3
/** Mastery level a word needs before it counts toward a light: right on two different days */
export const LANE_COUNTS_AT = 2

// Starting estimates for a ten-minute practice. Leave two minutes to check a difficult word
// or use it in a phrase. The weights are product defaults, not measured study times.
const CARD_MINUTES = 8
const MINUTES_PER_REVIEW = 1
const MINUTES_PER_NEW_WORD = 2
export const MAX_NEW_LANE_WORDS = 3

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

// A path set stores only words introduced by a lesson. Saved personal cards keep their own IDs and history.
export const laneSetId = (userId: string) => stableId(`memo-lane:v1:level3:${userId}`)
export const lanePracticeId = (userId: string, day: string) => stableId(`memo-lane-practice:${userId}:${day}`)
export const laneCardId = (setId: string, form: string) => stableId(`memo-lane-word:${setId}:${form}`)

function matchLaneWords<T extends CardLike>(list: ListWord[], cards: T[], srs: Record<string, CardSRS>, pathSet?: string) {
  const words = list.filter(w => w.level === LANE_LEVEL)
  const byForm = new Map<string, ListWord>()
  for (const word of words) {
    for (const form of word.forms) if (!byForm.has(form)) byForm.set(form, word)
  }
  // A correction to a generated card keeps its curriculum identity and accumulated history.
  const byPathId = new Map(pathSet ? words.map(w => [laneCardId(pathSet, w.forms[0]), w] as const) : [])
  const matched = new Map<ListWord, T>()
  for (const card of cards) {
    const word = byPathId.get(card.id) ?? cardForms(card).map(form => byForm.get(form)).find(Boolean)
    if (!word) continue
    const other = matched.get(word)
    if (!other || getMasteryLevel(srs[card.id]) > getMasteryLevel(srs[other.id])) matched.set(word, card)
  }
  return words.map((word, position) => ({ word, position, card: matched.get(word) }))
}

export function laneProgress(list: ListWord[], cards: CardLike[], srs: Record<string, CardSRS>, pathSet?: string): LaneProgress {
  const entries = matchLaneWords(list, cards, srs, pathSet)
  const seen = entries.flatMap(({ word, card }) => card && srs[card.id] ? [{ word, record: srs[card.id] }] : [])
  const familiar = seen.filter(({ record }) => getMasteryLevel(record) >= LANE_COUNTS_AT)
    .sort((a, b) => a.record.last_seen_at.localeCompare(b.record.last_seen_at))
    .map(({ word }) => ({ form: word.forms[0], pinyin: word.pinyin, meaning: laneMeaning(word) }))
  return { total: entries.length, familiar, started: seen.length - familiar.length }
}

// Common learner senses for missing glosses, dictionary cross-references and proper-name collisions.
const glosses: Record<string, string> = {
  白: 'white', 比如: 'for example', 成: 'to become; to succeed', 大方: 'generous',
  複習: 'to review a lesson', 還要: 'also need; still want', 好了: 'all right; it is ready',
  連絡: 'to contact; to get in touch', 平安: 'safe and sound', 清: 'clear; pure', 晒: 'to dry in the sun',
  說起來: 'speaking of it', 土: 'soil; earth', 友誼: 'friendship', 雲: 'cloud',
  直: 'straight', 資源: 'resources', 走走: 'to take a walk',
}
const laneMeaning = (word: ListWord) => glosses[word.forms[0]] ?? word.meaning

export function planLaneLesson<T extends CardLike>(list: ListWord[], cards: T[], srs: Record<string, CardSRS>, today: string, pathSet?: string) {
  const entries = matchLaneWords(list, cards, srs, pathSet)
  const due = entries.filter(({ card }) => card && srs[card.id]?.next_review <= today)
    .sort((a, b) => srs[a.card!.id].next_review.localeCompare(srs[b.card!.id].next_review))
  const reviews = due.slice(0, Math.floor(CARD_MINUTES / MINUTES_PER_REVIEW))
  const minutesLeft = CARD_MINUTES - reviews.length * MINUTES_PER_REVIEW
  const newLimit = Math.min(MAX_NEW_LANE_WORDS, Math.floor(minutesLeft / MINUTES_PER_NEW_WORD))
  const fresh = entries.filter(({ card }) => !card || !srs[card.id]).slice(0, newLimit)
  const picks = [...reviews, ...fresh].map(entry => ({ ...entry, meaning: laneMeaning(entry.word) }))
  const complete = entries.length > 0 && entries.every(({ card }) => card && getMasteryLevel(srs[card.id]) >= LANE_COUNTS_AT)
  return { picks, complete }
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
