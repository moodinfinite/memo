// Offline Chinese–English lookups from CC-CEDICT (public/cedict.txt, built by scripts/build-cedict.mjs).
// CC-CEDICT is CC BY-SA 4.0 — keep the attribution wherever lookups are shown.

export interface DictEntry { pinyin: string; meaning: string }
export type Dictionary = Map<string, DictEntry[]>
export interface LookupPart { word: string; entries: DictEntry[] }

const MAX_WORD = 12
const han = /\p{Script=Han}/u

/** Lines are traditional, simplified (empty when the same), pinyin, meaning — tab separated */
export function parseDictionary(text: string): Dictionary {
  const dict: Dictionary = new Map()
  const add = (key: string, entry: DictEntry) => {
    const list = dict.get(key)
    if (list) list.push(entry); else dict.set(key, [entry])
  }
  for (const line of text.split('\n')) {
    if (!line || line[0] === '#') continue
    const [trad, simp, pinyin, meaning] = line.split('\t')
    if (!meaning) continue
    const entry = { pinyin, meaning }
    add(trad, entry)
    if (simp && simp !== trad) add(simp, entry)
  }
  return dict
}

/** Splits selected text into dictionary words, longest match first; non-Chinese characters are skipped */
export function lookupText(dict: Dictionary, text: string): LookupPart[] {
  const chars = [...text]
  const parts: LookupPart[] = []
  for (let i = 0; i < chars.length;) {
    if (!han.test(chars[i])) { i++; continue }
    let part: LookupPart = { word: chars[i], entries: [] }
    for (let length = Math.min(MAX_WORD, chars.length - i); length > 0; length--) {
      const word = chars.slice(i, i + length).join('')
      const entries = dict.get(word)
      if (entries) { part = { word, entries }; break }
    }
    parts.push(part)
    i += [...part.word].length
  }
  return parts
}

/** "pīnyīn — meaning" for a saved card, using each word's first reading; null if any word is unknown */
export function cardDefinition(parts: LookupPart[]): string | null {
  if (!parts.length || parts.some(part => !part.entries.length)) return null
  if (parts.length === 1) return `${parts[0].entries[0].pinyin} — ${parts[0].entries[0].meaning}`
  return `${parts.map(part => part.entries[0].pinyin).join(' ')} — ${parts.map(part => part.entries[0].meaning.split('; ')[0]).join(' + ')}`
}

let pending: Promise<Dictionary> | null = null

/** Downloads and parses the dictionary once, on first lookup */
export function loadDictionary(): Promise<Dictionary> {
  if (!pending) {
    pending = fetch('/cedict.txt')
      .then(res => { if (!res.ok) throw new Error(`Dictionary unavailable (${res.status})`); return res.text() })
      .then(parseDictionary)
    pending.catch(() => { pending = null })
  }
  return pending
}
