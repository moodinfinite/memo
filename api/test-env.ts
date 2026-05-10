export default async function handler(req: any, res: any) {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return res.json({ configured: false })

  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-3-haiku-20240307',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'Say hi' }],
    }),
  })

  const body = await anthropicRes.text()
  return res.json({
    configured: true,
    keyPrefix: key.slice(0, 10),
    status: anthropicRes.status,
    response: body.slice(0, 500),
  })
}
