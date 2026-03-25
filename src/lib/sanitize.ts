/**
 * Sanitize user-provided text before storing in the database.
 * Strips HTML tags, control characters, and trims whitespace.
 */
export function sanitizeText(input: unknown, maxLength = 2000): string {
  if (typeof input !== 'string') return ''
  return input
    .replace(/<[^>]*>/g, '')                          // strip HTML tags
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')   // strip control characters
    .trim()
    .slice(0, maxLength)
}

/**
 * Sanitize card content (term + definition).
 */
export function sanitizeCard(card: { term: string; definition: string }) {
  return {
    term: sanitizeText(card.term, 500),
    definition: sanitizeText(card.definition, 2000),
  }
}

/**
 * Escape special characters for Supabase ilike queries.
 * Prevents users from injecting wildcards into search patterns.
 */
export function escapeIlike(query: string): string {
  return query.replace(/[%_\\]/g, '\\$&')
}
