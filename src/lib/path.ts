import type { ListWord } from './levelTest'
import { cardForms, laneThreshold } from './lane'

/**
 * The learning path: the official TOCFL words for a level, in units of about 10 ordered by usefulness and
 * grouped by topic. Topics, usefulness and one example sentence per word come from a one-off Claude
 * pass saved in public/path-tags.txt (reviewable, never generated at study time). Each level's units add
 * their words to one normal set, "Path · Level N", so Learn, Daily 10 and the Lane all see them.
 */

export const PATH_KEY = 'memo_path'
/** Level → section → unit. Units hold about this many words (5–14 in practice) */
export const UNIT_SIZE = 10
/** Topics with fewer words than this in a section are pooled into a mixed unit */
const MIN_TOPIC = 5
/**
 * How units are cut. 1: 6-word units (Nov 2026, first release). 2: about 10 words, small topics pooled.
 * Saved progress records the layout so older progress can be carried over by the words it covered.
 */
export const PATH_LAYOUT = 2

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
  mixed: { en: 'Mixed topics', zh: '綜合' },
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
    tags.set(`${level}:${form}`, { theme: THEMES[theme] && theme !== 'mixed' ? theme : 'general', use: Math.min(5, Math.max(1, Number(use) || 3)), example, english })
  }
  return tags
}

export const tagFor = (tags: Map<string, PathTag>, w: ListWord): PathTag | undefined => tags.get(`${w.level}:${w.forms[0]}`)

/** Levels that have tags, so their path can be built */
export const taggedLevels = (tags: Map<string, PathTag>) =>
  [...new Set([...tags.keys()].map(k => Number(k.split(':')[0])))].sort((a, b) => a - b)

export interface PathUnit { index: number; level: number; section: number; theme: string; words: ListWord[] }

const sectionOf = (use: number) => (use >= 4 ? 0 : use === 3 ? 1 : 2)

/** Split `n` items into `k` runs as even as possible, larger runs first */
const evenRuns = <T,>(items: T[], k: number): T[][] => {
  const runs: T[][] = []
  for (let i = 0, at = 0; i < k; i++) {
    const size = Math.floor(items.length / k) + (i < items.length % k ? 1 : 0)
    runs.push(items.slice(at, at + size)); at += size
  }
  return runs
}

/**
 * Units for one level. Most useful words first (three sections by usefulness); inside a section each topic's
 * words are split evenly into units of about 10, topics with only a few words share a mixed unit, and topics
 * take turns, the topic with the most useful words first. `layout` 1 rebuilds the original 6-word units.
 */
export function buildUnits(list: ListWord[], tags: Map<string, PathTag>, level: number, layout = PATH_LAYOUT): PathUnit[] {
  const words = list.filter(w => w.level === level)
  const units: PathUnit[] = []
  type Item = { word: ListWord; use: number; order: number; theme: string }
  const byUse = (a: Item, b: Item) => b.use - a.use || a.order - b.order
  for (let section = 0; section < SECTIONS.length; section++) {
    const byTheme = new Map<string, Item[]>()
    words.forEach((word, order) => {
      const tag = tagFor(tags, word)
      const use = tag?.use ?? 3
      if (sectionOf(use) !== section) return
      const theme = tag?.theme ?? 'general'
      byTheme.set(theme, [...(byTheme.get(theme) ?? []), { word, use, order, theme }])
    })
    const weightOf = (items: Item[]) => items.reduce((s, x) => s + x.use, 0)
    let queues: { theme: string; chunks: ListWord[][]; weight: number }[]
    if (layout === 1) {
      queues = [...byTheme].map(([theme, items]) => {
        items.sort(byUse)
        const chunks: ListWord[][] = []
        for (let i = 0; i < items.length; i += 6) chunks.push(items.slice(i, i + 6).map(x => x.word))
        if (chunks.length > 1 && chunks[chunks.length - 1].length < 3) chunks[chunks.length - 2].push(...chunks.pop()!)
        return { theme, chunks, weight: weightOf(items) }
      })
    } else {
      const pool: Item[] = []
      queues = []
      for (const [theme, items] of byTheme) {
        if (items.length < MIN_TOPIC) { pool.push(...items); continue }
        items.sort(byUse)
        queues.push({ theme, chunks: evenRuns(items, Math.max(1, Math.round(items.length / UNIT_SIZE))).map(r => r.map(x => x.word)), weight: weightOf(items) })
      }
      pool.sort(byUse)
      if (pool.length >= MIN_TOPIC || !queues.length) {
        const themes = new Set(pool.map(x => x.theme))
        if (pool.length) queues.push({ theme: themes.size === 1 ? pool[0].theme : 'mixed', chunks: evenRuns(pool, Math.max(1, Math.round(pool.length / UNIT_SIZE))).map(r => r.map(x => x.word)), weight: weightOf(pool) })
      } else {
        // A handful of stray words joins the section's smallest unit rather than making a tiny one
        const smallest = queues.flatMap(q => q.chunks).reduce((a, b) => (b.length < a.length ? b : a))
        smallest.push(...pool.map(x => x.word))
      }
    }
    queues.sort((a, b) => b.weight - a.weight || a.theme.localeCompare(b.theme))
    for (let round = 0; queues.some(q => round < q.chunks.length); round++) {
      for (const q of queues) if (round < q.chunks.length) units.push({ index: units.length, level, section, theme: q.theme, words: q.chunks[round] })
    }
  }
  return units
}

/** A unit's place in its section: unit `n` of `of` */
export function sectionPlace(units: PathUnit[], unit: PathUnit) {
  const inSection = units.filter(u => u.section === unit.section)
  return { n: inSection.findIndex(u => u.index === unit.index) + 1, of: inSection.length }
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

export interface PathProgress { start?: number; done: Record<string, number>; v?: number }

export function readProgress(metadata: Record<string, unknown> | null | undefined): PathProgress {
  const raw = metadata?.[PATH_KEY] as Partial<PathProgress> | undefined
  const done: Record<string, number> = {}
  for (const [k, v] of Object.entries(raw?.done ?? {})) if (/^\d$/.test(k) && Number.isInteger(v) && v >= 0) done[k] = v
  return { start: Number.isInteger(raw?.start) ? raw!.start : undefined, done, v: Number.isInteger(raw?.v) ? raw!.v : undefined }
}

/**
 * Carry progress saved under an older unit layout over to the current one, by words: a unit now counts as
 * done when every one of its words was in a unit finished before. Partly covered units come back, and only
 * their new words need sorting and learning.
 */
export function migrateProgress(progress: PathProgress, list: ListWord[], tags: Map<string, PathTag>): PathProgress {
  if (progress.v === PATH_LAYOUT) return progress
  const done: Record<string, number> = {}
  for (const [key, count] of Object.entries(progress.done)) {
    const level = Number(key)
    const covered = new Set(buildUnits(list, tags, level, progress.v ?? 1).slice(0, count).flatMap(u => u.words.map(w => w.forms[0])))
    const now = buildUnits(list, tags, level)
    const firstOpen = now.findIndex(u => u.words.some(w => !covered.has(w.forms[0])))
    done[key] = firstOpen < 0 ? now.length : firstOpen
  }
  return { ...progress, done, v: PATH_LAYOUT }
}

export const pathSetTitle = (level: number) => `Path · ${level === 0 ? 'Novice' : `Level ${level}`}`

/** The card a path word becomes: the same "pinyin — meaning" shape as words saved from stories */
export function pathCard(word: ListWord, tag?: PathTag) {
  const meaning = word.meaning.replace(/\s*\([^)]*\)/g, '').split(/[;/]/).map(m => m.trim()).filter(Boolean).slice(0, 3).join('; ')
  return { term: word.forms[0], definition: `${word.pinyin} — ${meaning || tag?.english || ''}`.replace(/ — $/, '') }
}

/** SRS start for a word the learner says they know: first review in two weeks, Familiar once they get it right then */
export const KNOWN_INTERVAL = 14

// ── The alley on Home: finished units switch its lights on ──

/** How far through the current unit a learner is, as part of a unit: sorted a third, learned two thirds */
export const STAGE_PART: Record<UnitStage | 'skip', number> = { sweep: 0, learn: 1 / 3, check: 2 / 3, skip: 0 }

export interface PathLights { lit: number; warmth: number; toNext: number; per: number }

/** Lights for a level: spread evenly over its units so the last light needs every unit */
export function pathLights(units: number, doneCount: number, stagePart: number, lights: number): PathLights {
  const per = Math.max(1, Math.round(units / lights))
  let lit = 0
  while (lit < lights && units > 0 && doneCount >= laneThreshold(units, lights, lit)) lit++
  if (lit >= lights || units === 0) return { per, lit, warmth: 0, toNext: 0 }
  const from = laneThreshold(units, lights, lit - 1), to = laneThreshold(units, lights, lit)
  return { per, lit, warmth: Math.min(0.9, (doneCount - from + stagePart) / (to - from)), toNext: to - doneCount }
}

/** The units that switched on light `index` */
export const unitsForLight = <T,>(units: T[], index: number, lights: number) =>
  units.slice(laneThreshold(units.length, lights, index - 1), laneThreshold(units.length, lights, index))

// ── Testing out: skip ahead by showing you already know a sample of what you'd skip ──

export type TestOutScope = 'section' | 'level'
/** Words sampled for each scope, and the share that must be right to skip */
export const TEST_OUT = { section: 10, level: 15, pass: 0.8 }

/** Units done after passing: the end of the current unit's section, or the whole level */
export function testOutTarget(units: PathUnit[], current: number, scope: TestOutScope): number {
  if (scope === 'level') return units.length
  let i = current
  while (i < units.length && units[i].section === units[current].section) i++
  return i
}

/** A random sample of the words that would be skipped (only ones not already in the learner's sets) */
export function testOutSample(units: PathUnit[], states: WordState[][], current: number, target: number, size: number, rand = Math.random): ListWord[] {
  const pool = units.slice(current, target).flatMap(u => u.words.filter((_, j) => states[u.index][j] === 'new'))
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]] }
  return pool.slice(0, size)
}

export const testOutPassed = (right: number, total: number) => total > 0 && right / total >= TEST_OUT.pass
