// In-memory rate limiter (per-IP, resets on cold start)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT_MAX = 10       // max requests per window
const RATE_LIMIT_WINDOW = 60000 // 1 minute window

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

/** Strip HTML tags and trim to prevent injection via card content */
function sanitize(str: unknown, maxLen = 500): string {
  if (typeof str !== 'string') return ''
  return str
    .replace(/<[^>]*>/g, '')       // strip HTML
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '') // strip control chars
    .trim()
    .slice(0, maxLen)
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Rate limiting
  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
    || req.socket?.remoteAddress || 'unknown'
  if (isRateLimited(clientIp)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a minute.' })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' })
  }

  // Parse body safely
  let body = req.body
  if (typeof body === 'string') {
    try { body = JSON.parse(body) } catch { body = {} }
  }
  body = body || {}

  const { cards } = body
  if (!cards || !Array.isArray(cards) || cards.length === 0) {
    return res.status(400).json({ error: 'No cards provided' })
  }

  // Validate and sanitize card content
  const sanitizedCards = cards
    .slice(0, 12)
    .map((c: any) => ({
      term: sanitize(c?.term, 200),
      definition: sanitize(c?.definition, 500),
    }))
    .filter((c: any) => c.term.length > 0 && c.definition.length > 0)

  if (sanitizedCards.length === 0) {
    return res.status(400).json({ error: 'No valid cards provided' })
  }

  const cardList = sanitizedCards
    .map((c: any) => `- ${c.term}: ${c.definition}`)
    .join('\n')

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
        max_tokens: 120,
        messages: [{
          role: 'user',
          content: `Give exactly 3 short, descriptive title options for a flashcard set with these terms. Each title should be 5 words max, no quotes, no numbers, no punctuation, one per line:\n\n${cardList}\n\nTitles:`,
        }],
      }),
    })
  } catch (err: any) {
    return res.status(502).json({ error: 'Network error reaching AI' })
  }

  if (!anthropicRes.ok) {
    // Don't leak raw error details to client
    console.error('Anthropic API error:', await anthropicRes.text())
    return res.status(502).json({ error: 'AI service temporarily unavailable' })
  }

  const data = await anthropicRes.json()
  const raw = (data.content?.[0]?.text ?? '').trim()
  const suggestions = raw
    .split('\n')
    .map((l: string) => l.replace(/^[-•\d.)\s]+/, '').replace(/['"]/g, '').trim())
    .filter((l: string) => l.length > 0 && l.length <= 80) // cap suggestion length
    .slice(0, 3)

  return res.json({ suggestions })
}
