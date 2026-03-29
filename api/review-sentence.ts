const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT_MAX = 30
const RATE_LIMIT_WINDOW = 60000

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW })
    return false
  }
  entry.count++
  return entry.count > RATE_LIMIT_MAX
}

function sanitize(str: unknown, maxLen = 500): string {
  if (typeof str !== 'string') return ''
  return str
    .replace(/<[^>]*>/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .trim()
    .slice(0, maxLen)
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
    || req.socket?.remoteAddress || 'unknown'
  if (isRateLimited(clientIp)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a minute.' })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' })

  let body = req.body
  if (typeof body === 'string') {
    try { body = JSON.parse(body) } catch { body = {} }
  }
  body = body || {}

  const term = sanitize(body.term, 200)
  const definition = sanitize(body.definition, 500)
  const sentence = sanitize(body.sentence, 1000)

  if (!term || !definition || !sentence) {
    return res.status(400).json({ error: 'term, definition and sentence are required' })
  }

  let anthropicRes: Response
  try {
    anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: `You are a language tutor reviewing a student's use of a vocabulary word.

Term: ${term}
Definition: ${definition}
Student's sentence: "${sentence}"

Evaluate whether the word is used naturally and correctly. Be encouraging and specific. Keep feedback concise (2-3 sentences max).

Respond with JSON only, no extra text:
{
  "feedback": "your feedback here",
  "improved": "an improved version of their sentence if needed, or null if it is already great",
  "score": "great" or "good" or "needs_work"
}`,
        }],
      }),
    })
  } catch {
    return res.status(502).json({ error: 'Network error reaching AI' })
  }

  if (!anthropicRes.ok) {
    console.error('Anthropic API error:', await anthropicRes.text())
    return res.status(502).json({ error: 'AI service temporarily unavailable' })
  }

  const data = await anthropicRes.json()
  const raw = (data.content?.[0]?.text ?? '').trim()

  let parsed: { feedback?: string; improved?: string | null; score?: string }
  try {
    parsed = JSON.parse(raw)
  } catch {
    // Fallback if model doesn't return clean JSON
    return res.json({ feedback: raw, improved: null, score: 'good' })
  }

  const validScores = ['great', 'good', 'needs_work']
  return res.json({
    feedback: sanitize(parsed.feedback ?? '', 800),
    improved: parsed.improved ? sanitize(parsed.improved, 500) : null,
    score: validScores.includes(parsed.score ?? '') ? parsed.score : 'good',
  })
}
