import type { Card } from './database.types'
import { shuffle } from './shuffle'
const normalized = (text: string) => text.normalize('NFKC').trim().toLocaleLowerCase()
export function makeLearnChoices(card: Card, cards: Card[]) {
  const seen = new Set([normalized(card.term)])
  const distractors = cards.filter(other => {
    const term = normalized(other.term)
    if (other.id === card.id || !term || seen.has(term) || normalized(other.definition) === normalized(card.definition)) return false
    seen.add(term)
    return true
  })
  if (distractors.length < 3) return []
  return shuffle([{ text: card.term, correct: true }, ...shuffle(distractors).slice(0, 3).map(c => ({ text: c.term, correct: false }))])
}
