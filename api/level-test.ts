import Anthropic from '@anthropic-ai/sdk'

// Level check: Claude writes HSK placement items, a separate call answers them
// blind to double-check the key, and a third grades the writing task.
// Signed-in users only — each request spends real API credit.

const MODEL = 'claude-opus-5-5'
const SKILLS = ['vocabulary', 'grammar', 'reading'] as const
type Skill = typeof SKILLS[number]
export interface Item { skill: Skill; passage: string; question: string; options: string[]; answer: number; explanation: string }

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

const GENERATE_SYSTEM = `You write items for an adaptive Chinese placement test that estimates a learner's HSK level on the six-level scale (HSK 1–6). The learner reads Traditional Chinese characters (Taiwan usage): write every Chinese text in Traditional characters.

For the requested level, write exactly 5 multiple-choice items: 2 vocabulary, 2 grammar, 1 reading.
- vocabulary: test a word typical of that level. Either show the Chinese word and ask for its English meaning, or give an English meaning and ask which Chinese word fits. Distractors are plausible words of the same level.
- grammar: a Chinese sentence with one blank (＿＿) testing a structure typical of that level; options are Chinese fillers.
- reading: a short passage at that level (HSK 1–2: one or two sentences; HSK 3–4: three to five; HSK 5–6: five to eight) with one question about it. Ask the question in English for HSK 1–3 and in Chinese for HSK 4–6.

Every item has exactly 4 options and exactly one correct answer; the other three must be clearly wrong to someone who knows the material. No trick questions and no "all/none of the above". Vary which position (0–3) holds the answer. Leave "passage" empty except for reading items. Do not reuse anything listed under "Already used". Keep "explanation" to one short English sentence.`

const ITEMS_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          skill: { type: 'string', enum: [...SKILLS] },
          passage: { type: 'string' },
          question: { type: 'string' },
          options: { type: 'array', items: { type: 'string' } },
          answer: { type: 'integer' },
          explanation: { type: 'string' },
        },
        required: ['skill', 'passage', 'question', 'options', 'answer', 'explanation'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
}

const VERIFY_SYSTEM = `You are proofreading a Chinese placement test before learners see it. For each numbered item, work out the correct option yourself (0–3). Set "clear" to false when the item is ambiguous, has more than one defensible answer or none, uses Simplified characters, or does not fit the stated HSK level.`

const VERIFY_SCHEMA = {
  type: 'object',
  properties: {
    checks: {
      type: 'array',
      items: {
        type: 'object',
        properties: { index: { type: 'integer' }, answer: { type: 'integer' }, clear: { type: 'boolean' } },
        required: ['index', 'answer', 'clear'],
        additionalProperties: false,
      },
    },
  },
  required: ['checks'],
  additionalProperties: false,
}

const GRADE_SYSTEM = `You grade a short piece of writing from a learner of Traditional Chinese, to estimate their writing level on the six-level HSK scale. Judge vocabulary range, grammar accuracy and how well it answers the task. If it is empty, not Chinese, or off-task, give level 1. Write "feedback" as two or three kind, specific English sentences. Write "corrected" as a natural corrected version in Traditional Chinese that keeps the learner's meaning.`

const GRADE_SCHEMA = {
  type: 'object',
  properties: { level: { type: 'integer' }, feedback: { type: 'string' }, corrected: { type: 'string' } },
  required: ['level', 'feedback', 'corrected'],
  additionalProperties: false,
}

const levelFrom = (value: unknown) => Math.min(6, Math.max(1, Math.round(Number(value)) || 1))

function validItems(raw: unknown): Item[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item: any) => {
    const options = Array.isArray(item?.options) ? item.options.map((o: unknown) => clean(o, 200)).filter(Boolean) : []
    const answer = Number(item?.answer)
    if (!SKILLS.includes(item?.skill) || options.length !== 4 || new Set(options).size !== 4 || !Number.isInteger(answer) || answer < 0 || answer > 3) return []
    const question = clean(item.question, 600)
    if (!question) return []
    return [{ skill: item.skill, passage: clean(item.passage, 1200), question, options, answer, explanation: clean(item.explanation, 300) }]
  })
}

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
    if (body.action === 'generate') {
      const used = (Array.isArray(body.avoid) ? body.avoid : []).slice(0, 40).map((q: unknown) => clean(q, 120)).filter(Boolean)
      const out = await askJSON<{ items: unknown }>(GENERATE_SYSTEM, `Level: HSK ${level}\nAlready used:\n${used.length ? used.join('\n') : 'none'}`, ITEMS_SCHEMA, 'medium')
      return res.json({ items: validItems(out.items) })
    }

    if (body.action === 'verify') {
      const items = validItems(body.items).slice(0, 8)
      if (!items.length) return res.json({ items: [] })
      const listing = items.map((item, i) =>
        `Item ${i} (${item.skill})\n${item.passage ? `Passage: ${item.passage}\n` : ''}Question: ${item.question}\n${item.options.map((o, j) => `${j}. ${o}`).join('\n')}`).join('\n\n')
      const out = await askJSON<{ checks: { index: number; answer: number; clear: boolean }[] }>(VERIFY_SYSTEM, `Stated level: HSK ${level}\n\n${listing}`, VERIFY_SCHEMA, 'low')
      const confirmed = new Set((out.checks ?? []).filter(c => c.clear && items[c.index]?.answer === c.answer).map(c => c.index))
      return res.json({ items: items.filter((_, i) => confirmed.has(i)) })
    }

    if (body.action === 'grade') {
      const task = clean(body.task, 400), text = clean(body.text, 1500)
      const out = await askJSON<{ level: number; feedback: string; corrected: string }>(GRADE_SYSTEM, `Task (HSK ${level}): ${task}\n\nLearner's writing:\n${text || '(empty)'}`, GRADE_SCHEMA, 'low')
      return res.json({ level: levelFrom(out.level), feedback: clean(out.feedback, 800), corrected: clean(out.corrected, 1500) })
    }

    return res.status(400).json({ error: 'Unknown action' })
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return res.status(429).json({ error: 'The AI service is busy. Please try again in a minute.' })
    if (err instanceof Anthropic.APIError) return res.status(502).json({ error: `AI service error (${err.status ?? 'unknown'})` })
    return res.status(502).json({ error: err instanceof Error ? err.message : 'Something went wrong' })
  }
}
