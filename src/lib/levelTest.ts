// Level check on Taiwan's TOCFL scale (Novice, then levels 1–6).
// Difficulty comes from the official word list, not from Claude: words are sampled by TOCFL level,
// answers feed one running ability estimate that allows for guessing, and the reported level is the
// conservative end of that estimate. See docs/level-check-research.md for the reasoning.

export const LEVELS_KEY = 'memo_levels'
export const SCALE = 'tocfl'
export const MIN_LEVEL = 0
export const MAX_LEVEL = 6
/** The word list stops at level 5 (流利級), so the test can't tell 5 from 6 */
export const MAX_TESTED = 5
export const KEEP_RESULTS = 6
export const DUE_AFTER_DAYS = 30

export type StatSkill = 'vocabulary' | 'reading' | 'writing'
export const STAT_SKILLS: StatSkill[] = ['vocabulary', 'reading', 'writing']

export interface LevelResult {
  date: string
  level: number
  /** Results from before the TOCFL rebuild have no scale and used the old HSK 1–6 test */
  scale?: typeof SCALE
  range?: [number, number]
  skills: Partial<Record<StatSkill | 'grammar', number | null>>
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))
export const clampLevel = (level: number) => clamp(Math.round(level), MIN_LEVEL, MAX_LEVEL)

// ── Levels ────────────────────────────────────────────────────────────

/**
 * What each level means. Word counts are the cumulative size of the TOCFL list at that level; reading
 * descriptions follow the CEFR reading scale each level is aligned to (our wording, not official).
 */
export const TOCFL_LEVELS: { level: number; name: string; zh: string; cefr: string; words: string; canDo: string }[] = [
  { level: 0, name: 'Novice', zh: '準備級', cefr: 'pre-A1', words: '400', canDo: 'Numbers, greetings and a few dozen characters; spots familiar words on signs' },
  { level: 1, name: 'Level 1', zh: '入門級', cefr: 'A1', words: '750', canDo: 'Very short, simple texts: names, prices, simple signs and notes' },
  { level: 2, name: 'Level 2', zh: '基礎級', cefr: 'A2', words: '1,200', canDo: 'Short everyday texts: common dishes on a menu, timetables, short messages' },
  { level: 3, name: 'Level 3', zh: '進階級', cefr: 'B1', words: '2,400', canDo: 'Everyday texts on familiar topics and graded readers; news is still a slog' },
  { level: 4, name: 'Level 4', zh: '高階級', cefr: 'B2', words: '4,700', canDo: 'The gist of news articles and reports, with some lookups' },
  { level: 5, name: 'Level 5', zh: '流利級', cefr: 'C1', words: '7,500', canDo: 'Newspapers and long texts with only occasional lookups' },
  { level: 6, name: 'Level 6', zh: '精通級', cefr: 'C2', words: '8,000+', canDo: 'Virtually anything written, including literature and specialist texts' },
]
export const levelInfo = (level: number) => TOCFL_LEVELS[clampLevel(level)]
/** "Novice" or "Level 3" */
export const levelName = (level: number) => levelInfo(level).name

/** A rank for each level, shown on the profile stat sheet */
export const RANKS: Record<number, { en: string; zh: string }> = {
  0: { en: 'Novice', zh: '新手' },
  1: { en: 'Apprentice', zh: '學徒' },
  2: { en: 'Wanderer', zh: '旅人' },
  3: { en: 'Scholar', zh: '學者' },
  4: { en: 'Writer', zh: '文人' },
  5: { en: 'Master', zh: '師傅' },
  6: { en: 'Grandmaster', zh: '宗師' },
}
export const rankFor = (level: number) => RANKS[clampLevel(level)]

// ── History ───────────────────────────────────────────────────────────

/** Past results saved on the account, newest first; ignores anything malformed */
export function levelHistory(metadata: Record<string, unknown> | undefined | null): LevelResult[] {
  const raw = metadata?.[LEVELS_KEY]
  if (!Array.isArray(raw)) return []
  return raw
    .filter((r): r is LevelResult => !!r && typeof r.date === 'string' && !Number.isNaN(Date.parse(r.date)) && Number.isInteger(r.level))
    .sort((a, b) => b.date.localeCompare(a.date))
}

export const isLegacy = (r: LevelResult) => r.scale !== SCALE
/** Only results from the TOCFL test count for the badge, stats and due date */
export const currentResults = (history: LevelResult[]) => history.filter(r => !isLegacy(r))

export function withResult(history: LevelResult[], result: LevelResult): LevelResult[] {
  return [result, ...history].sort((a, b) => b.date.localeCompare(a.date)).slice(0, KEEP_RESULTS)
}

/** Due when there is no TOCFL result yet or the last one is a month old */
export function isLevelCheckDue(history: LevelResult[], now = new Date()): boolean {
  const [latest] = currentResults(history)
  if (!latest) return true
  return now.getTime() - Date.parse(latest.date) >= DUE_AFTER_DAYS * 86_400_000
}

/** Each skill's level now and at the previous check, so gained levels can be marked */
export function skillStats(history: LevelResult[]): { skill: StatSkill; level: number | null; previous: number | null }[] {
  const [latest, before] = currentResults(history)
  return STAT_SKILLS.map(skill => ({ skill, level: latest?.skills?.[skill] ?? null, previous: before?.skills?.[skill] ?? null }))
}

// ── Word list ─────────────────────────────────────────────────────────

export interface ListWord { level: number; forms: string[]; pinyin: string; meaning: string; pos: string }

/** public/tocfl.txt lines: level, /-separated forms, pinyin, meaning, part of speech */
export function parseWordList(text: string): ListWord[] {
  const words: ListWord[] = []
  for (const line of text.split('\n')) {
    if (!line || line[0] === '#') continue
    const [level, forms, pinyin, meaning = '', pos = ''] = line.split('\t')
    if (!forms || !/^\d$/.test(level)) continue
    words.push({ level: Number(level), forms: forms.split('/'), pinyin, meaning, pos })
  }
  return words
}

let pendingList: Promise<ListWord[]> | null = null
export function loadWordList(): Promise<ListWord[]> {
  if (!pendingList) {
    pendingList = fetch('/tocfl.txt')
      .then(res => { if (!res.ok) throw new Error(`Word list unavailable (${res.status})`); return res.text() })
      .then(parseWordList)
    pendingList.catch(() => { pendingList = null })
  }
  return pendingList
}

// Particles, measure words, determiners and conjunctions have meanings that are hard to type
const UNTESTABLE_POS = /^(Ptc|M|Det|Conj)$/
export const isTestable = (w: ListWord) => !!w.meaning && !w.pos.split('/').every(p => UNTESTABLE_POS.test(p))

/**
 * Picks a word at `level` the learner hasn't been asked yet. About 70% of picks avoid words already
 * in their flashcards, so the check measures reading level rather than flashcard memory.
 */
export function pickWord(words: ListWord[], level: number, asked: Set<string>, studied: Set<string>, random = Math.random): ListWord | null {
  const pool = words.filter(w => w.level === level && isTestable(w) && !asked.has(w.forms[0]))
  const fresh = pool.filter(w => !w.forms.some(f => studied.has(f)))
  const from = fresh.length && random() < 0.7 ? fresh : pool
  return from.length ? from[Math.floor(random() * from.length)] : null
}

// ── Grading typed meanings ────────────────────────────────────────────

const STOP = new Set(['a', 'an', 'the', 'to', 'be', 'of', 'sb', 'sth', 'one', "one's", 'someone', 'something', 'or', 'and', 'is', 'are', 'it', 'in', 'on', 'at', 'for', 'with', 'by'])
const stem = (w: string) => (w.length > 4 ? w.replace(/(ing|ed|es|s|ly)$/, '') : w)
const contentWords = (text: string) =>
  text.toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[^a-z' ]+/g, ' ').split(/\s+/).filter(w => w && !STOP.has(w)).map(stem)

/**
 * 1 when the typed answer clearly matches a dictionary sense, 0 when blank, null when it needs a
 * closer look (Claude grades those).
 */
export function matchMeaning(answer: string, meaning: string): 1 | 0 | null {
  if (!answer.trim()) return 0
  const typed = contentWords(answer)
  if (!typed.length) return null
  for (const sense of meaning.split(/[;/]/)) {
    const words = contentWords(sense)
    if (!words.length) continue
    if (typed.every(w => words.includes(w)) && typed.length * 2 > words.length) return 1
    if (words.every(w => typed.includes(w))) return 1
  }
  return null
}

// ── Ability estimate ──────────────────────────────────────────────────

/**
 * One answer. `difficulty` is on the level scale, `guess` is the chance of getting it right blind
 * (0 for typed answers, 1/4 for four-option multiple choice) and `score` runs from 0 to 1.
 */
export interface Answer { difficulty: number; guess: number; score: number; kind: 'word' | 'reading' }

/** How sharply success falls off around an item's difficulty, per level (an assumption, not calibrated) */
const SLOPE = 1.7
/** A word new at level L: a learner who has just reached L knows about 60% of them */
export const wordDifficulty = (level: number) => level - 0.3
/** Reading connected text is a little harder than knowing its words */
export const readingDifficulty = (level: number) => level

const GRID = Array.from({ length: 151 }, (_, i) => -1 + i * 0.05)
const logistic = (x: number) => 1 / (1 + Math.exp(-x))
export const pCorrect = (theta: number, a: Pick<Answer, 'difficulty' | 'guess'>) => a.guess + (1 - a.guess) * logistic(SLOPE * (theta - a.difficulty))

export interface Estimate { mean: number; sd: number; weights: number[] }

/** Posterior over ability after these answers; the broad prior leans low, so the first words come from Level 1 */
export function estimate(answers: Answer[], prior = { mean: 0, sd: 2 }): Estimate {
  const logw = GRID.map(theta => {
    let lw = -((theta - prior.mean) ** 2) / (2 * prior.sd ** 2)
    for (const a of answers) {
      const p = clamp(pCorrect(theta, a), 1e-6, 1 - 1e-6)
      lw += a.score * Math.log(p) + (1 - a.score) * Math.log(1 - p)
    }
    return lw
  })
  const max = Math.max(...logw)
  const raw = logw.map(l => Math.exp(l - max))
  const total = raw.reduce((s, w) => s + w, 0)
  const weights = raw.map(w => w / total)
  const mean = GRID.reduce((s, t, i) => s + t * weights[i], 0)
  const sd = Math.sqrt(GRID.reduce((s, t, i) => s + (t - mean) ** 2 * weights[i], 0))
  return { mean, sd, weights }
}

/** P(ability ≥ level) */
export const probAtLeast = (e: Estimate, level: number) => GRID.reduce((s, t, i) => s + (t >= level ? e.weights[i] : 0), 0)

/** Highest level reached with at least `confidence` probability (0.7 for the headline, 0.3 for the top of the range) */
export function levelAt(e: Estimate, confidence: number): number {
  let level = MIN_LEVEL
  for (let l = MIN_LEVEL + 1; l <= MAX_TESTED; l++) if (probAtLeast(e, l) >= confidence) level = l
  return level
}

/** The level whose words sit closest to 50/50 for this learner */
export const nextWordLevel = (e: Estimate) => clamp(Math.round(e.mean + 0.3), MIN_LEVEL, MAX_TESTED)

export const MIN_WORDS = 20
export const MAX_WORDS = 30
export function wordsDone(answers: Answer[], e: Estimate): boolean {
  const words = answers.filter(a => a.kind === 'word').length
  return words >= MAX_WORDS || (words >= MIN_WORDS && e.sd < 0.35)
}

/** Reading passages are written at the estimated level (read first) and one either side */
export function passageLevels(e: Estimate): number[] {
  const center = clamp(Math.floor(e.mean), MIN_LEVEL, MAX_TESTED)
  return [center, center - 1, center + 1].filter(l => l >= MIN_LEVEL && l <= MAX_TESTED)
}

/** Seconds allowed for a passage and its questions; answers after that count half (slow decoding) */
export const readingSeconds = (passage: string, questions: number) => 20 + Math.round([...passage].length * 0.75) + questions * 15

/** How much of a real-world text the learner says they could read */
export type RealityRating = 'most' | 'some' | 'little'

export function buildResult(answers: Answer[], writing: number | null, reality: RealityRating | null, now = new Date()): LevelResult & { capped: boolean } {
  const all = estimate(answers)
  const vocab = estimate(answers.filter(a => a.kind === 'word'))
  const readingAnswers = answers.filter(a => a.kind === 'reading')
  let level = levelAt(all, 0.7)
  const top = Math.max(level, levelAt(all, 0.3))
  // A text at this level that the learner could barely read caps the result one level lower
  const capped = reality === 'little' && level > MIN_LEVEL
  if (capped) level -= 1
  return {
    date: now.toISOString(),
    level,
    scale: SCALE,
    range: [level, top],
    skills: {
      vocabulary: levelAt(vocab, 0.7),
      reading: readingAnswers.length ? Math.min(levelAt(estimate(readingAnswers, { mean: vocab.mean, sd: 1.5 }), 0.7), top) : null,
      writing,
    },
    capped,
  }
}

// ── Writing ───────────────────────────────────────────────────────────

/** A sentence through level 2, a paragraph from level 3 */
export const WRITING_TASKS: Record<number, { prompt: string; hint: string }> = {
  0: { prompt: 'Write one sentence about yourself: your name, where you are from, or something you like.', hint: '例：我叫小明，我喜歡喝茶。' },
  1: { prompt: 'Write one or two sentences about what you did yesterday.', hint: '昨天我…' },
  2: { prompt: 'Write two or three sentences about your favourite place to eat and why you like it.', hint: '我最喜歡的餐廳是…' },
  3: { prompt: 'Write a short paragraph (about 80 characters) about a trip you remember.', hint: '有一次我去…' },
  4: { prompt: 'Write a paragraph (about 150 characters): is it better to live in a city or the countryside?', hint: '我覺得…' },
  5: { prompt: 'Write a paragraph (about 200 characters) on how technology has changed the way people learn languages.', hint: '隨著科技的發展…' },
  6: { prompt: 'Write a paragraph (about 200 characters) on how technology has changed the way people learn languages.', hint: '隨著科技的發展…' },
}
export const writingTask = (level: number) => WRITING_TASKS[clampLevel(level)]
export const isParagraphTask = (level: number) => clampLevel(level) >= 3

// ── Checking generated passages ───────────────────────────────────────

const han = /\p{Script=Han}/u

/** Every form of every word mapped to its level, lowest level winning */
export function levelMap(words: ListWord[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const w of words) for (const f of w.forms) if (!map.has(f) || map.get(f)! > w.level) map.set(f, w.level)
  return map
}

/**
 * Splits a passage into list words (longest match) and measures how much of it sits above `level`.
 * Words not on the list (names, rare compounds) count half, since some are harmless.
 */
export function profilePassage(text: string, levels: Map<string, number>, level: number): { tokens: number; above: number; unlisted: number; share: number } {
  const chars = [...text]
  let tokens = 0, above = 0, unlisted = 0
  for (let i = 0; i < chars.length;) {
    if (!han.test(chars[i])) { i++; continue }
    let length = Math.min(6, chars.length - i)
    for (; length > 1; length--) if (levels.has(chars.slice(i, i + length).join(''))) break
    const wordLevel = levels.get(chars.slice(i, i + length).join(''))
    tokens++
    if (wordLevel === undefined) unlisted++
    else if (wordLevel > level) above++
    i += length
  }
  return { tokens, above, unlisted, share: tokens ? (above + unlisted / 2) / tokens : 0 }
}

/** Passages may have at most this share of above-level words (an assumption to tune) */
export const MAX_ABOVE_SHARE = 0.12

/** Words the passage writer should lean on: a few new at the level to anchor it, plus easier ones */
export function vocabularyHint(words: ListWord[], level: number, random = Math.random): { anchors: string[]; allowed: string[] } {
  const sample = (pool: ListWord[], n: number) => {
    const copy = [...pool]
    const out: string[] = []
    while (copy.length && out.length < n) out.push(copy.splice(Math.floor(random() * copy.length), 1)[0].forms[0])
    return out
  }
  return {
    anchors: sample(words.filter(w => w.level === level && /^(N|V|Vs|Vi|Vst|Vp|Vpt|Adv)/.test(w.pos)), 4),
    allowed: sample(words.filter(w => w.level <= level), 80),
  }
}
