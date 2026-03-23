import type { Card } from './database.types'

export interface MCQuestion {
  card: Card
  options: string[]        // 4 options, shuffled
  correctIndex: number     // index of correct answer in options
}

/**
 * Generates multiple choice questions from a card set.
 * Each question: 1 correct answer + 3 distractors from other cards.
 * Requires at least 4 cards. Returns empty array if not enough cards.
 */
export function generateMCQuestions(cards: Card[]): MCQuestion[] {
  if (cards.length < 4) return []

  return cards.map((card) => {
    const others = cards.filter((c) => c.id !== card.id)
    const distractors = shuffle(others)
      .slice(0, 3)
      .map((c) => c.definition)

    const options = shuffle([card.definition, ...distractors])
    const correctIndex = options.indexOf(card.definition)

    return { card, options, correctIndex }
  })
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
