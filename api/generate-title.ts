export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' })
  }

  // Vercel sometimes delivers body as string even with content-type: application/json
  let body = req.body
  if (typeof body === 'string') {
    try { body = JSON.parse(body) } catch { body = {} }
  }
  body = body || {}

  const { cards } = body
  if (!cards || !Array.isArray(cards) || cards.length === 0) {
    return res.status(400).json({ error: 'No cards provided' })
  }

  const cardList = cards
    .slice(0, 12)
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
    return res.status(502).json({ error: 'Network error reaching AI', detail: err?.message })
  }

  if (!anthropicRes.ok) {
    const errText = await anthropicRes.text()
    return res.status(502).json({ error: 'AI error', detail: errText })
  }

  const data = await anthropicRes.json()
  const raw = (data.content?.[0]?.text ?? '').trim()
  const suggestions = raw
    .split('\n')
    .map((l: string) => l.replace(/^[-•\d.)\s]+/, '').replace(/['"]/g, '').trim())
    .filter((l: string) => l.length > 0)
    .slice(0, 3)

  return res.json({ suggestions })
}
