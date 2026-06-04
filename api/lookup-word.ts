
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

function sanitize(str: unknown, maxLen = 200): string {
  if (typeof str !== 'string') return ''
  return str.replace(/<[^>]*>/g, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').trim().slice(0, maxLen)
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
    || req.socket?.remoteAddress || 'unknown'
  if (isRateLimited(clientIp)) return res.status(429).json({ error: 'Too many requests' })


  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' })

  let body = req.body
  if (typeof body === 'string') { try { body = JSON.parse(body) } catch { body = {} } }
  body = body || {}

  const word = sanitize(body.word, 100)
  if (!word) return res.status(400).json({ error: 'word is required' })

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
        max_tokens: 80,
        messages: [{
          role: 'user',
          content: `Look up this Chinese word or phrase: "${word}"

Reply in EXACTLY this format and nothing else:
pīnyīn — English definition

Rules:
- Use tone-marked pinyin (ā á ǎ à, etc.)
- Keep the English definition concise (under 10 words)
- If multiple meanings, list the 2 most common separated by a semicolon
- If not a valid Chinese word, reply: unknown — unknown`,
        }],
      }),
    })
  } catch {
    return res.status(502).json({ error: 'Network error reaching AI' })
  }

  if (!anthropicRes.ok) return res.status(502).json({ error: 'AI service unavailable' })

  const data = await anthropicRes.json()
  const definition = sanitize(data.content?.[0]?.text ?? '', 300)
  if (!definition || definition === 'unknown — unknown') {
    return res.status(422).json({ error: 'Not a recognised Chinese word' })
  }

  return res.json({ definition })
}
