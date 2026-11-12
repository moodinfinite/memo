// Builds public/tocfl.txt, the leveled word list the level check samples from.
// Levels come from Taiwan's TOCFL 8,000-word list (2023 edition, https://tocfl.edu.tw), as parsed into
// CSV by https://github.com/ivankra/tocfl (tocfl-202307.csv). Meanings come from our own public/cedict.txt.
// Usage: node scripts/build-tocfl.mjs <path to tocfl-202307.csv> [cedict path] [output path]
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

/** Minimal RFC 4180 parser: quoted fields, doubled quotes, commas and newlines inside quotes */
export function parseCSV(text) {
  const rows = []
  let row = [], field = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') { row.push(field); field = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field); rows.push(row); row = []; field = ''
    } else field += ch
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  return rows.filter(r => r.length > 1)
}

const plain = pinyin => pinyin.normalize('NFC').toLowerCase().replace(/[\s'·-]/g, '')

/** "L0-1001" → 0 (Novice), "L3-0864" → 3 */
export const levelOf = id => Number(/^L(\d)/.exec(id)?.[1] ?? NaN)

export function buildWordList(csvText, cedictText) {
  const glosses = new Map()
  for (const line of cedictText.split('\n')) {
    if (!line || line[0] === '#') continue
    const [trad, , pinyin, meaning] = line.split('\t')
    if (!meaning) continue
    const list = glosses.get(trad) ?? []
    list.push({ pinyin: plain(pinyin), meaning })
    glosses.set(trad, list)
  }

  const [header, ...rows] = parseCSV(csvText)
  const col = name => header.indexOf(name)
  const seen = new Set()
  const out = []
  for (const r of rows) {
    const level = levelOf(r[col('ID')])
    if (!Number.isInteger(level)) continue
    const variants = r[col('Variants')] ? JSON.parse(r[col('Variants')]) : null
    const forms = variants ? [...new Set(variants.map(v => v.Traditional))] : [r[col('Traditional')]]
    const pinyin = variants ? variants[0].Pinyin : r[col('Pinyin')]
    if (seen.has(forms[0])) continue
    seen.add(forms[0])
    // Prefer the dictionary reading that matches the list's pinyin
    const entries = forms.flatMap(form => glosses.get(form) ?? [])
    const meaning = (entries.find(e => e.pinyin === plain(pinyin)) ?? entries[0])?.meaning ?? ''
    out.push([level, forms.join('/'), pinyin, meaning, r[col('POS')]].join('\t'))
  }
  return out
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input, cedict = 'public/cedict.txt', output = 'public/tocfl.txt'] = process.argv.slice(2)
  if (!input) { console.error('Usage: node scripts/build-tocfl.mjs <tocfl-202307.csv> [cedict.txt] [output]'); process.exit(1) }
  const lines = buildWordList(readFileSync(input, 'utf8'), readFileSync(cedict, 'utf8'))
  const header = [
    '# Word levels: TOCFL 8,000-word list, 2023 edition, Steering Committee for the Test Of Proficiency–Huayu — https://tocfl.edu.tw',
    '# (CSV parse by https://github.com/ivankra/tocfl). Meanings: CC-CEDICT, CC BY-SA 4.0 — https://www.mdbg.net/chinese/dictionary?page=cc-cedict',
    '# Format: level (0 = Novice, 1–5)<TAB>traditional forms, /-separated<TAB>pinyin<TAB>meaning (empty if not in CC-CEDICT)<TAB>part of speech',
  ]
  writeFileSync(output, header.concat(lines).join('\n') + '\n')
  console.log(`${lines.length} words → ${output} (${lines.filter(l => !l.split('\t')[3]).length} without a meaning)`)
}
