import * as XLSX from 'xlsx'
import type { SentenceEntry } from './database.types'

export function exportSentencesToExcel(entries: SentenceEntry[], setTitle: string) {
  const rows = entries.map((e, i) => ({
    '#': i + 1,
    'Term': e.term,
    'Definition': e.definition,
    'Your Sentence': e.sentence,
    'AI Feedback': e.feedback,
    'Suggested Improvement': e.improved ?? '—',
    'Score': e.score === 'great' ? 'Great' : e.score === 'good' ? 'Good' : 'Needs work',
  }))

  const ws = XLSX.utils.json_to_sheet(rows)

  // Set column widths
  ws['!cols'] = [
    { wch: 4 },   // #
    { wch: 20 },  // Term
    { wch: 30 },  // Definition
    { wch: 45 },  // Your Sentence
    { wch: 55 },  // AI Feedback
    { wch: 45 },  // Suggested Improvement
    { wch: 12 },  // Score
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sentences')

  const safeTitle = setTitle.replace(/[/\\?*[\]]/g, '').trim().slice(0, 50) || 'Sentences'
  XLSX.writeFile(wb, `${safeTitle} – Sentences.xlsx`)
}
