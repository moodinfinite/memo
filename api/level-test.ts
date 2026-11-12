import Anthropic from '@anthropic-ai/sdk'

// Level check on Taiwan's TOCFL scale. The app picks words from the official list and scores the
// answers itself; Claude only writes reading passages around list words, checks them (once with the
// passage, once from the options alone), grades typed meanings the app couldn't match, and grades writing.
// Signed-in users only — each request spends real API credit.

const MODEL = 'claude-opus-5-5'

// Public project values (also shipped in the browser bundle). Vercel functions don't see the
// tracked .env that Vite builds from, so these are the fallback.
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://rjdamlnfoaxcgcjcjehg.supabase.co'
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJqZGFtbG5mb2F4Y2djamNqZWhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyNDYzMjMsImV4cCI6MjA4OTgyMjMyM30.kCGsR08uqvrLp15uduCtR_Ru8_ZFXe-dI07eSmJwHpw'

const requestLog = new Map<string, number[]>()
const MAX_REQUESTS = 30
const WINDOW_MS = 10 * 60_000

function rateLimited(userId: string): boolean {
  const now = Date.now()
  const recent = (requestLog.get(userId) ?? []).filter(t => now - t < WINDOW_MS)
  recent.push(now)
  requestLog.set(userId, recent)
  return recent.length > MAX_REQUESTS
}

const clean = (value: unknown, max: number) =>
  typeof value === 'string' ? value.replace(/<[^>]*>/g, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').trim().slice(0, max) : ''

async function signedInUser(req: any): Promise<string | null> {
  const token = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY }, signal: controller.signal })
    if (!res.ok) return null
    const user = await res.json()
    return typeof user?.id === 'string' ? user.id : null
  } catch { return null } finally { clearTimeout(timer) }
}

const client = new Anthropic()

/** One structured-output request; throws when the model declines or the JSON is unusable */
async function askJSON<T>(system: string, user: string, schema: Record<string, unknown>, effort: 'low' | 'medium'): Promise<T> {
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort, format: { type: 'json_schema', schema } },
    system,
    messages: [{ role: 'user', content: user }],
  })
  if (response.stop_reason === 'refusal') throw new Error('The model declined this request')
  const text = response.content.flatMap(block => (block.type === 'text' ? [block.text] : [])).join('')
  return JSON.parse(text) as T
}

const LEVEL_GUIDE = `Taiwan's TOCFL levels: 0 Novice (準備級, pre-A1, about 400 words), 1 (入門級, A1, about 750), 2 (基礎級, A2, about 1,200), 3 (進階級, B1, about 2,400), 4 (高階級, B2, about 4,700), 5 (流利級, C1, about 7,500), 6 (精通級, C2).`

const PASSAGE_SYSTEM = `You write reading material for a placement test on Taiwan's TOCFL scale. The learner reads Traditional Chinese (Taiwan usage); write every Chinese text in Traditional characters. ${LEVEL_GUIDE}

For the requested level write:
- "passage": a natural text a learner at that level should just manage. Length: level 0 one or two short sentences (about 20 characters); level 1 about 40 characters; level 2 about 70; level 3 about 120; level 4 about 180; level 5 about 250. Use every word listed under "Must use". Otherwise stick to words from "Allowed words" or simpler ones. No idioms, no rare characters, no names beyond very common ones (小明, 王先生).
- "questions": exactly 3 multiple-choice comprehension questions, each with 4 options and exactly one correct answer. Every question must need the passage: the wrong options should be what a careless reader might pick (a detail from the passage misread, swapped or reversed). No option may be absurd or answerable from common sense, grammar or the options alone. For levels 0–1 write the question and options in simple English; from level 2 write them in Traditional Chinese no harder than the passage. Vary which position (0–3) holds the answer. "explanation" is one short English sentence.
- "realWorld": a different short text of the kind a reader in Taiwan meets at that level: levels 0–2 a menu section, price list or shop sign; level 3 a notice, text message or MRT announcement; levels 4–5 a news paragraph. Same vocabulary limits as the passage. "kind" names it in English (for example "Breakfast shop menu"); "gist" is a one-sentence English summary.`

const PASSAGE_SCHEMA = {
  type: 'object',
  properties: {
    passage: { type: 'string' },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          question: { type: 'string' },
          options: { type: 'array', items: { type: 'string' } },
          answer: { type: 'integer' },
          explanation: { type: 'string' },
        },
        required: ['question', 'options', 'answer', 'explanation'],
        additionalProperties: false,
      },
    },
    realWorld: {
      type: 'object',
      properties: { kind: { type: 'string' }, text: { type: 'string' }, gist: { type: 'string' } },
      required: ['kind', 'text', 'gist'],
      additionalProperties: false,
    },
  },
  required: ['passage', 'questions', 'realWorld'],
  additionalProperties: false,
}

const KEY_CHECK_SYSTEM = `You are proofreading a Chinese reading test before learners see it. For each numbered question, read the passage and work out the correct option (0–3) yourself. Set "clear" to false when the question is ambiguous, has more than one defensible answer or none, or uses Simplified characters.`

const OPTIONS_ONLY_SYSTEM = `You are checking a multiple-choice reading test for giveaways. You will not see the passage the questions are about. For each numbered question, pick the option most likely to be correct from the question and options alone. Set "confident" to true only if you would bet on that answer without the passage, for example because of common sense, grammar, one option being uniquely specific, or the others being obviously wrong.`

const CHECK_SCHEMA = (flag: 'clear' | 'confident') => ({
  type: 'object',
  properties: {
    checks: {
      type: 'array',
      items: {
        type: 'object',
        properties: { index: { type: 'integer' }, answer: { type: 'integer' }, [flag]: { type: 'boolean' } },
        required: ['index', 'answer', flag],
        additionalProperties: false,
      },
    },
  },
  required: ['checks'],
  additionalProperties: false,
})

const MEANINGS_SYSTEM = `You grade a vocabulary test. For each Chinese word (Traditional, Taiwan usage) the learner typed what they think it means in English. Score 1 if the answer captures a correct meaning of the word (synonyms, loose wording and spelling mistakes are fine; any common sense of the word counts), 0.5 if it is partly right (the right idea but too vague, too narrow or the wrong part of speech), and 0 if it is wrong. The reference meaning is a guide, not the only acceptable answer.`

const MEANINGS_SCHEMA = {
  type: 'object',
  properties: {
    grades: {
      type: 'array',
      items: {
        type: 'object',
        properties: { index: { type: 'integer' }, score: { type: 'number', enum: [0, 0.5, 1] } },
        required: ['index', 'score'],
        additionalProperties: false,
      },
    },
  },
  required: ['grades'],
  additionalProperties: false,
}

const GRADE_SYSTEM = `You grade a short piece of writing from a learner of Traditional Chinese (Taiwan usage), to estimate their writing level. ${LEVEL_GUIDE} Judge vocabulary range, grammar accuracy and how well it answers the task, and be conservative: a few correct simple sentences are level 1, not level 3. If it is empty, not Chinese, or off-task, give level 0. Write "feedback" as two or three kind, specific English sentences. Write "corrected" as a natural corrected version in Traditional Chinese that keeps the learner's meaning.`

const GRADE_SCHEMA = {
  type: 'object',
  properties: { level: { type: 'integer' }, feedback: { type: 'string' }, corrected: { type: 'string' } },
  required: ['level', 'feedback', 'corrected'],
  additionalProperties: false,
}

const levelFrom = (value: unknown) => Math.min(6, Math.max(0, Math.round(Number(value)) || 0))
const strings = (value: unknown, count: number, max: number) =>
  (Array.isArray(value) ? value : []).slice(0, count).map(v => clean(v, max)).filter(Boolean)

export interface Question { question: string; options: string[]; answer: number; explanation: string }

function validQuestions(raw: unknown): Question[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((q: any) => {
    const options = Array.isArray(q?.options) ? q.options.map((o: unknown) => clean(o, 200)).filter(Boolean) : []
    const answer = Number(q?.answer)
    const question = clean(q?.question, 400)
    if (!question || options.length !== 4 || new Set(options).size !== 4 || !Number.isInteger(answer) || answer < 0 || answer > 3) return []
    return [{ question, options, answer, explanation: clean(q.explanation, 300) }]
  })
}

const listing = (questions: Question[]) =>
  questions.map((q, i) => `Question ${i}: ${q.question}\n${q.options.map((o, j) => `${j}. ${o}`).join('\n')}`).join('\n\n')

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'API key not configured' })

  const userId = await signedInUser(req)
  if (!userId) return res.status(401).json({ error: 'Please sign in again to take the level check.' })
  if (rateLimited(userId)) return res.status(429).json({ error: 'Too many requests. Please wait a few minutes.' })

  let body = req.body
  if (typeof body === 'string') { try { body = JSON.parse(body) } catch { body = {} } }
  body = body || {}
  const level = levelFrom(body.level)

  try {
    if (body.action === 'passage') {
      const anchors = strings(body.anchors, 6, 12), allowed = strings(body.allowed, 100, 12)
      const out = await askJSON<{ passage: unknown; questions: unknown; realWorld: any }>(PASSAGE_SYSTEM,
        `Level: ${level}\nMust use: ${anchors.join('、') || 'nothing in particular'}\nAllowed words: ${allowed.join('、')}`, PASSAGE_SCHEMA, 'medium')
      return res.json({
        passage: clean(out.passage, 1500),
        questions: validQuestions(out.questions).slice(0, 3),
        realWorld: { kind: clean(out.realWorld?.kind, 80), text: clean(out.realWorld?.text, 800), gist: clean(out.realWorld?.gist, 300) },
      })
    }

    if (body.action === 'verify') {
      const passage = clean(body.passage, 1500)
      const questions = validQuestions(body.questions).slice(0, 5)
      if (!passage || !questions.length) return res.json({ keep: [] })
      const [withPassage, blind] = await Promise.all([
        askJSON<{ checks: { index: number; answer: number; clear: boolean }[] }>(KEY_CHECK_SYSTEM, `Stated level: ${level}\n\nPassage:\n${passage}\n\n${listing(questions)}`, CHECK_SCHEMA('clear'), 'low'),
        askJSON<{ checks: { index: number; answer: number; confident: boolean }[] }>(OPTIONS_ONLY_SYSTEM, listing(questions), CHECK_SCHEMA('confident'), 'low'),
      ])
      const agreed = new Set((withPassage.checks ?? []).filter(c => c.clear && questions[c.index]?.answer === c.answer).map(c => c.index))
      const giveaway = new Set((blind.checks ?? []).filter(c => c.confident && questions[c.index]?.answer === c.answer).map(c => c.index))
      return res.json({ keep: questions.map((_, i) => i).filter(i => agreed.has(i) && !giveaway.has(i)) })
    }

    if (body.action === 'meanings') {
      const items = (Array.isArray(body.items) ? body.items : []).slice(0, 12).map((item: any) => ({
        word: clean(item?.word, 20), pinyin: clean(item?.pinyin, 40), meaning: clean(item?.meaning, 200), answer: clean(item?.answer, 100),
      }))
      if (!items.length) return res.json({ scores: [] })
      const out = await askJSON<{ grades: { index: number; score: number }[] }>(MEANINGS_SYSTEM,
        items.map((it: any, i: number) => `${i}. ${it.word} (${it.pinyin}) — reference: ${it.meaning}\n   Learner: ${it.answer || '(blank)'}`).join('\n'), MEANINGS_SCHEMA, 'low')
      const scores = items.map(() => 0)
      for (const g of out.grades ?? []) if (Number.isInteger(g.index) && g.index >= 0 && g.index < scores.length) scores[g.index] = g.score >= 0.75 ? 1 : g.score >= 0.25 ? 0.5 : 0
      return res.json({ scores })
    }

    if (body.action === 'grade') {
      const task = clean(body.task, 400), text = clean(body.text, 1500)
      const out = await askJSON<{ level: number; feedback: string; corrected: string }>(GRADE_SYSTEM, `Task (TOCFL level ${level}): ${task}\n\nLearner's writing:\n${text || '(empty)'}`, GRADE_SCHEMA, 'low')
      return res.json({ level: levelFrom(out.level), feedback: clean(out.feedback, 800), corrected: clean(out.corrected, 1500) })
    }

    return res.status(400).json({ error: 'Unknown action' })
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return res.status(429).json({ error: 'The AI service is busy. Please try again in a minute.' })
    if (err instanceof Anthropic.APIError) return res.status(502).json({ error: `AI service error (${err.status ?? 'unknown'})` })
    return res.status(502).json({ error: err instanceof Error ? err.message : 'Something went wrong' })
  }
}
