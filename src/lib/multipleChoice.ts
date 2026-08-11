import type { Card } from './database.types'
import { shuffle } from './shuffle'

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

    // Track correct flag through the shuffle so duplicate definitions don't
    // cause indexOf to land on a distractor instead of the correct option.
    const tagged = shuffle([
      { text: card.definition, correct: true },
      ...distractors.map((d) => ({ text: d, correct: false })),
    ])
    const options = tagged.map((o) => o.text)
    const correctIndex = tagged.findIndex((o) => o.correct)

    return { card, options, correctIndex }
  })
}

