export interface ParsedCard {
  term: string
  definition: string
  position: number
}

export interface ParseResult {
  cards: ParsedCard[]
  errors: string[]
}

/**
 * Parses Quizlet-style tab-separated text.
 * Each line: term[TAB]definition
 * Lines starting with # are treated as comments and skipped.
 * Empty lines are skipped.
 */
export function parseTabSeparated(raw: string): ParseResult {
  const lines = raw.split('\n')
  const cards: ParsedCard[] = []
  const errors: string[] = []
  let position = 0

  lines.forEach((line, i) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return

    const tabIndex = trimmed.indexOf('\t')

    if (tabIndex === -1) {
      errors.push(`Line ${i + 1}: no tab separator found — "${trimmed.slice(0, 40)}${trimmed.length > 40 ? '…' : ''}"`)
      return
    }

    const term = trimmed.slice(0, tabIndex).trim()
    const definition = trimmed.slice(tabIndex + 1).trim()

    if (!term) {
      errors.push(`Line ${i + 1}: term is empty`)
      return
    }
    if (!definition) {
      errors.push(`Line ${i + 1}: definition is empty for term "${term}"`)
      return
    }

    cards.push({ term, definition, position: position++ })
  })

  return { cards, errors }
}
