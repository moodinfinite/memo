const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT_MAX = 20
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

  const setTitle = sanitize(body.setTitle, 200)
  const rawTerms = Array.isArray(body.terms) ? body.terms : []
  const terms = rawTerms
    .slice(0, 8)
    .map((t: any) => ({ term: sanitize(t.term, 200), definition: sanitize(t.definition, 500) }))
    .filter((t: any) => t.term && t.definition)

  if (terms.length === 0) {
    return res.status(400).json({ error: 'At least one term is required' })
  }

  const termList = terms.map((t: any) => `- ${t.term}: ${t.definition}`).join('\n')

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
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: `You are writing a short story for a vocabulary study app.

Set subject: "${setTitle || 'General vocabulary'}"

Vocabulary words to include:
${termList}

Write a cohesive 4–6 sentence paragraph. Requirements:
- Match the tone and setting of the subject matter (medical vocab → a medical scenario, French cuisine → a dining scene, history → a historical moment, etc.)
- Take genuine creative liberty to make the story vivid, specific, and memorable
- Weave each vocabulary term in naturally so its meaning is clear from context
- Use the exact spelling of every term as listed above
- Use ALL the terms provided

Return only the story paragraph — no title, no quotes, no explanation, no extra formatting.`,
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
  const story = sanitize(data.content?.[0]?.text ?? '', 2000)

  if (!story) return res.status(502).json({ error: 'Empty response from AI' })

  return res.json({ story })
}
