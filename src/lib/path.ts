import type { ListWord } from './levelTest'
import { cardForms } from './lane'

/**
 * The learning path: the official TOCFL words for a level, in 6-word units ordered by usefulness and
 * grouped by topic. Topics, usefulness and one example sentence per word come from a one-off Claude
 * pass saved in public/path-tags.txt (reviewable, never generated at study time). Each level's units add
 * their words to one normal set, "Path · Level N", so Learn, Daily 10 and the Lane all see them.
 */

export const PATH_KEY = 'memo_path'
export const UNIT_SIZE = 6
/** A topic's leftover words join its last unit when fewer than this */
const MIN_UNIT = 3

export const THEMES: Record<string, { en: string; zh: string }> = {
  food: { en: 'Food & drink', zh: '飲食' },
  travel: { en: 'Getting around', zh: '旅行' },
  daily: { en: 'Daily life', zh: '日常生活' },
  shopping: { en: 'Shopping', zh: '購物' },
  people: { en: 'People', zh: '與他人的關係' },
  personal: { en: 'About you', zh: '個人資料' },
  home: { en: 'Home & surroundings', zh: '房屋與環境' },
  leisure: { en: 'Free time', zh: '閒暇娛樂' },
  health: { en: 'Health & body', zh: '身體健康' },
  work: { en: 'Work', zh: '工作' },
  education: { en: 'Study', zh: '教育' },
  feelings: { en: 'Feelings & opinions', zh: '情感與看法' },
  society: { en: 'Society & news', zh: '社會與新聞' },
  general: { en: 'Core words', zh: '常用詞' },
}

export const SECTIONS = ['Everyday words', 'Useful words', 'Less common words']

export interface PathTag { theme: string; use: number; example: string; english: string }

/** public/path-tags.txt lines: level, form, theme, usefulness 1–5, example, English */
export function parsePathTags(text: string): Map<string, PathTag> {
  const tags = new Map<string, PathTag>()
  for (const line of text.split('\n')) {
    if (!line || line[0] === '#') continue
    const [level, form, theme, use, example = '', english = ''] = line.split('\t')
    if (!form || !/^\d$/.test(level)) continue
    tags.set(`${level}:${form}`, { theme: THEMES[theme] ? theme : 'general', use: Math.min(5, Math.max(1, Number(use) || 3)), example, english })
  }
  return tags
}

export const tagFor = (tags: Map<string, PathTag>, w: ListWord): PathTag | undefined => tags.get(`${w.level}:${w.forms[0]}`)

/** Levels that have tags, so their path can be built */
export const taggedLevels = (tags: Map<string, PathTag>) =>
  [...new Set([...tags.keys()].map(k => Number(k.split(':')[0])))].sort((a, b) => a - b)

export interface PathUnit { index: number; level: number; section: number; theme: string; words: ListWord[] }

const sectionOf = (use: number) => (use >= 4 ? 0 : use === 3 ? 1 : 2)

/**
 * Units for one level. Most useful words first (three sections by usefulness); inside a section each topic's
 * words are cut into units of about 6, and topics take turns, the topic with the most useful words first.
 */
export function buildUnits(list: ListWord[], tags: Map<string, PathTag>, level: number): PathUnit[] {
  const words = list.filter(w => w.level === level)
  const units: PathUnit[] = []
  for (let section = 0; section < SECTIONS.length; section++) {
    const byTheme = new Map<string, { word: ListWord; use: number; order: number }[]>()
    words.forEach((word, order) => {
      const tag = tagFor(tags, word)
      const use = tag?.use ?? 3
      if (sectionOf(use) !== section) return
      const theme = tag?.theme ?? 'general'
      byTheme.set(theme, [...(byTheme.get(theme) ?? []), { word, use, order }])
    })
    const queues = [...byTheme].map(([theme, items]) => {
      items.sort((a, b) => b.use - a.use || a.order - b.order)
      const chunks: ListWord[][] = []
      for (let i = 0; i < items.length; i += UNIT_SIZE) chunks.push(items.slice(i, i + UNIT_SIZE).map(x => x.word))
      if (chunks.length > 1 && chunks[chunks.length - 1].length < MIN_UNIT) chunks[chunks.length - 2].push(...chunks.pop()!)
      const weight = items.reduce((s, x) => s + x.use, 0)
      return { theme, chunks, weight }
    }).sort((a, b) => b.weight - a.weight || a.theme.localeCompare(b.theme))
    for (let round = 0; queues.some(q => round < q.chunks.length); round++) {
      for (const q of queues) if (round < q.chunks.length) units.push({ index: units.length, level, section, theme: q.theme, words: q.chunks[round] })
    }
  }
  return units
}

/** Where each word stands: already in one of your own sets, added to the path set (seen or not yet), or new */
export type WordState = 'own' | 'added' | 'seen' | 'new'

export interface CardRef { id: string; set_id: string; term: string; definition: string }

/** Every Chinese form across the learner's cards, split into their own sets and the path sets */
export function indexCards(cards: CardRef[], pathSetIds: Set<string>) {
  const own = new Set<string>()
  const path = new Map<string, CardRef>()
  for (const card of cards) {
    for (const form of cardForms(card)) {
      if (pathSetIds.has(card.set_id)) { if (!path.has(form)) path.set(form, card) }
      else own.add(form)
    }
  }
  return { own, path }
}

export function wordState(word: ListWord, index: ReturnType<typeof indexCards>, seen: (cardId: string) => boolean): { state: WordState; card?: CardRef } {
  if (word.forms.some(f => index.own.has(f))) return { state: 'own' }
  const card = word.forms.map(f => index.path.get(f)).find(Boolean)
  if (card) return { state: seen(card.id) ? 'seen' : 'added', card }
  return { state: 'new' }
}

/** What the unit needs next: sweep its new words, learn the added ones, or take the check */
export type UnitStage = 'sweep' | 'learn' | 'check'
export const unitStage = (states: WordState[]): UnitStage | 'skip' =>
  states.every(s => s === 'own') ? 'skip' : states.includes('new') ? 'sweep' : states.includes('added') ? 'learn' : 'check'

export interface PathProgress { start?: number; done: Record<string, number> }

export function readProgress(metadata: Record<string, unknown> | null | undefined): PathProgress {
  const raw = metadata?.[PATH_KEY] as Partial<PathProgress> | undefined
  const done: Record<string, number> = {}
  for (const [k, v] of Object.entries(raw?.done ?? {})) if (/^\d$/.test(k) && Number.isInteger(v) && v >= 0) done[k] = v
  return { start: Number.isInteger(raw?.start) ? raw!.start : undefined, done }
}

export const pathSetTitle = (level: number) => `Path · ${level === 0 ? 'Novice' : `Level ${level}`}`

/** The card a path word becomes: the same "pinyin — meaning" shape as words saved from stories */
export function pathCard(word: ListWord, tag?: PathTag) {
  const meaning = word.meaning.replace(/\s*\([^)]*\)/g, '').split(/[;/]/).map(m => m.trim()).filter(Boolean).slice(0, 3).join('; ')
  return { term: word.forms[0], definition: `${word.pinyin} — ${meaning || tag?.english || ''}`.replace(/ — $/, '') }
}

/** SRS start for a word the learner says they know: first review in two weeks, Familiar once they get it right then */
export const KNOWN_INTERVAL = 14
