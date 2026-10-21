export type Skill = 'vocabulary' | 'grammar' | 'reading'
export const SKILLS: Skill[] = ['vocabulary', 'grammar', 'reading']

export interface LevelItem { skill: Skill; passage: string; question: string; options: string[]; answer: number; explanation: string }
export interface Stage { level: number; items: LevelItem[]; answers: number[] }
export interface LevelResult {
  date: string
  level: number
  skills: Record<Skill | 'writing', number | null>
}

export const LEVELS_KEY = 'memo_levels'
export const MIN_LEVEL = 1
export const MAX_LEVEL = 6
export const MAX_STAGES = 4
export const KEEP_RESULTS = 6
export const DUE_AFTER_DAYS = 30
const PASS = 0.8, FAIL = 0.4, HOLD = 0.6

const clampLevel = (level: number) => Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, Math.round(level)))
const ratio = (correct: number, total: number) => (total ? correct / total : 0)
const stageScore = (stage: Stage) => ratio(stage.items.filter((item, i) => stage.answers[i] === item.answer).length, stage.items.length)

/** Past results saved on the account, newest first; ignores anything malformed */
export function levelHistory(metadata: Record<string, unknown> | undefined | null): LevelResult[] {
  const raw = metadata?.[LEVELS_KEY]
  if (!Array.isArray(raw)) return []
  return raw
    .filter((r): r is LevelResult => !!r && typeof r.date === 'string' && !Number.isNaN(Date.parse(r.date)) && Number.isInteger(r.level))
    .sort((a, b) => b.date.localeCompare(a.date))
}

export function withResult(history: LevelResult[], result: LevelResult): LevelResult[] {
  return [result, ...history].sort((a, b) => b.date.localeCompare(a.date)).slice(0, KEEP_RESULTS)
}

/** A check is due when there is no result yet or the last one is a month old */
export function isLevelCheckDue(history: LevelResult[], now = new Date()): boolean {
  if (!history.length) return true
  return now.getTime() - Date.parse(history[0].date) >= DUE_AFTER_DAYS * 86_400_000
}

/** Start where the learner last landed, or at HSK 2 the first time */
export const startLevel = (history: LevelResult[]) => (history.length ? clampLevel(history[0].level) : 2)

/**
 * Staircase: a strong stage (80%+) climbs a level, a weak one (40% or less)
 * drops a level, anything in between settles it. Never revisits a level and
 * stops after four stages.
 */
export function nextStageLevel(stages: Stage[]): number | null {
  const last = stages[stages.length - 1]
  if (!last || stages.length >= MAX_STAGES) return null
  const score = stageScore(last)
  const next = score >= PASS ? last.level + 1 : score <= FAIL ? last.level - 1 : null
  if (next === null || next < MIN_LEVEL || next > MAX_LEVEL) return null
  return stages.some(stage => stage.level === next) ? null : next
}

/** Highest level passed at 60%+; when nothing passed, one below the lowest level tried */
function highestPassed(results: { level: number; score: number }[], threshold: number): number {
  const passed = results.filter(r => r.score >= threshold).map(r => r.level)
  if (passed.length) return Math.max(...passed)
  return clampLevel(Math.min(...results.map(r => r.level)) - 1)
}

export function estimateLevel(stages: Stage[]): number {
  if (!stages.length) return MIN_LEVEL
  return highestPassed(stages.map(stage => ({ level: stage.level, score: stageScore(stage) })), HOLD)
}

/** Rough per-skill level from the same answers; null when a skill was never asked */
export function skillLevel(stages: Stage[], skill: Skill): number | null {
  const results = stages.flatMap(stage => {
    const asked = stage.items.map((item, i) => ({ item, i })).filter(({ item }) => item.skill === skill)
    if (!asked.length) return []
    const correct = asked.filter(({ item, i }) => stage.answers[i] === item.answer).length
    return [{ level: stage.level, score: ratio(correct, asked.length) }]
  })
  return results.length ? highestPassed(results, 0.5) : null
}

/** Overall level leans on the multiple-choice estimate, nudged by writing */
export function overallLevel(reading: number, writing: number | null): number {
  return writing === null ? reading : clampLevel((reading * 3 + writing) / 4)
}

export function buildResult(stages: Stage[], writing: number | null, now = new Date()): LevelResult {
  const estimate = estimateLevel(stages)
  return {
    date: now.toISOString(),
    level: overallLevel(estimate, writing),
    skills: {
      vocabulary: skillLevel(stages, 'vocabulary'),
      grammar: skillLevel(stages, 'grammar'),
      reading: skillLevel(stages, 'reading'),
      writing,
    },
  }
}

/** A sentence for HSK 1–3, a paragraph for HSK 4–6 */
export const WRITING_TASKS: Record<number, { prompt: string; hint: string }> = {
  1: { prompt: 'Write one sentence about yourself: your name, where you are from, or something you like.', hint: '例：我叫小明，我喜歡喝茶。' },
  2: { prompt: 'Write one or two sentences about what you did yesterday.', hint: '昨天我…' },
  3: { prompt: 'Write two or three sentences about your favourite place to eat and why you like it.', hint: '我最喜歡的餐廳是…' },
  4: { prompt: 'Write a short paragraph (about 80 characters) about a trip you remember.', hint: '有一次我去…' },
  5: { prompt: 'Write a paragraph (about 150 characters): is it better to live in a city or the countryside?', hint: '我覺得…' },
  6: { prompt: 'Write a paragraph (about 200 characters) on how technology has changed the way people learn languages.', hint: '隨著科技的發展…' },
}
export const writingTask = (level: number) => WRITING_TASKS[clampLevel(level)]
export const isParagraphTask = (level: number) => clampLevel(level) >= 4
