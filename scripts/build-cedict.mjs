// Converts CC-CEDICT (https://www.mdbg.net/chinese/dictionary?page=cc-cedict) into the compact
// public/cedict.txt the app loads for story word lookups.
// Usage: node scripts/build-cedict.mjs <path to cedict_1_0_ts_utf-8_mdbg.txt> [output path]
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const MARKS = { a: 'āáǎàa', e: 'ēéěèe', i: 'īíǐìi', o: 'ōóǒòo', u: 'ūúǔùu', ü: 'ǖǘǚǜü' }

/** "lu:4" → "lǜ", "Bei3" → "Běi", "r5" → "r"; anything that is not a numbered syllable passes through */
export function markSyllable(token) {
  const match = /^([A-Za-zü:]+?)([1-5])$/.exec(token)
  if (!match) return token.replace(/u:/g, 'ü').replace(/U:/g, 'Ü')
  let [, letters, tone] = match
  letters = letters.replace(/u:/g, 'ü').replace(/U:/g, 'Ü').replace(/v/g, 'ü')
  if (tone === '5') return letters
  const lower = letters.toLowerCase()
  let index = lower.search(/[ae]/)
  if (index < 0) index = lower.indexOf('ou')
  if (index < 0) { for (let i = lower.length - 1; i >= 0; i--) if ('iouü'.includes(lower[i])) { index = i; break } }
  if (index < 0) return letters
  const vowel = lower[index], marked = MARKS[vowel][Number(tone) - 1]
  const out = letters[index] === vowel ? marked : marked.toUpperCase()
  return letters.slice(0, index) + out + letters.slice(index + 1)
}

const isFiller = sense => /^(old )?variant of /i.test(sense) || /^(also written|see also|surname) /i.test(sense) || /^used in /i.test(sense)

function cleanSenses(raw) {
  const senses = raw.split('/').map(s => s.replace(/\(bound form\)\s*/g, '').trim()).filter(s => s && !s.startsWith('CL:'))
  let text = senses.slice(0, 3).join('; ')
  if (text.length > 90) text = text.slice(0, 87).replace(/[;,]?\s+\S*$/, '') + '…'
  return { text, filler: senses.length > 0 && senses.every(isFiller) }
}

export function buildDictionary(input, output) {
  const entries = []
  for (const line of readFileSync(input, 'utf8').split('\n')) {
    if (!line || line.startsWith('#')) continue
    const match = /^(\S+) (\S+) \[([^\]]*)\] \/(.*)\/\s*$/.exec(line)
    if (!match) continue
    const [, trad, simp, pinyin, senses] = match
    const { text, filler } = cleanSenses(senses)
    if (!text) continue
    entries.push({ trad, simp, pinyin: pinyin.split(' ').map(markSyllable).join(' '), text, filler })
  }

  // Keep variant/surname-only readings only when they are the headword's sole entry
  const hasRealEntry = new Set(entries.filter(e => !e.filler).flatMap(e => [e.trad, e.simp]))
  const kept = entries.filter(e => !e.filler || !hasRealEntry.has(e.trad))

  const header = [
    '# Derived from CC-CEDICT, published by MDBG — https://www.mdbg.net/chinese/dictionary?page=cc-cedict',
    '# License: Creative Commons Attribution-ShareAlike 4.0 — https://creativecommons.org/licenses/by-sa/4.0/',
    '# Changes: pinyin tone numbers converted to tone marks; first three senses kept, measure-word (CL:) notes and "(bound form)" labels removed;',
    '# variant/surname-only readings dropped when the headword has another entry. Format: traditional<TAB>simplified (empty if same)<TAB>pinyin<TAB>meaning',
  ]
  writeFileSync(output, header.concat(kept.map(e => [e.trad, e.simp === e.trad ? '' : e.simp, e.pinyin, e.text].join('\t'))).join('\n') + '\n')
  console.log(`${kept.length} of ${entries.length} entries → ${output}`)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input, output = 'public/cedict.txt'] = process.argv.slice(2)
  if (!input) { console.error('Usage: node scripts/build-cedict.mjs <cedict.txt> [output]'); process.exit(1) }
  buildDictionary(input, output)
}
