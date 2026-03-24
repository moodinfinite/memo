export const config = { runtime: 'edge' }

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API key not configured' }), { status: 500 })
  }

  const { cards } = await req.json()
  if (!cards || cards.length === 0) {
    return new Response(JSON.stringify({ error: 'No cards provided' }), { status: 400 })
  }

  const cardList = (cards as { term: string; definition: string }[])
    .slice(0, 12)
    .map(c => `- ${c.term}: ${c.definition}`)
    .join('\n')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 40,
      messages: [{
        role: 'user',
        content: `Give a short, descriptive title (5 words max, no quotes, no punctuation) for a flashcard set with these terms:\n\n${cardList}\n\nTitle:`,
      }],
    }),
  })

  if (!res.ok) {
    return new Response(JSON.stringify({ error: 'AI error' }), { status: 502 })
  }

  const data = await res.json()
  const title = (data.content?.[0]?.text ?? '').trim().replace(/['"]/g, '')
  return new Response(JSON.stringify({ title }), {
    headers: { 'content-type': 'application/json' },
  })
}
