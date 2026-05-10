export default function handler(req: any, res: any) {
  const key = process.env.ANTHROPIC_API_KEY
  return res.json({
    configured: !!key,
    length: key?.length ?? 0,
    prefix: key ? key.slice(0, 6) : null,
  })
}
