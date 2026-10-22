const han = /\p{Script=Han}/u

/** `lang` for text containing Chinese characters, so styles can size it with :lang(zh) */
export const chineseLang = (text: string) => (han.test(text) ? 'zh-Hant' : undefined)

/** Size bucket for a term on a card: one or two characters read best very large, phrases smaller */
export const termLength = (text: string) => {
  const count = [...text.trim()].length
  return count <= 2 ? 'short' : count <= 4 ? 'medium' : 'long'
}

const hanOnly = (text: string) => [...text].filter(ch => han.test(ch)).join('')

/**
 * Whether written characters match a term. Only Chinese characters count, so
 * spaces, punctuation and pinyin are ignored, and any one of several forms
 * listed in the term (棟／栋, 看見、看到) is accepted.
 */
export function writingMatches(typed: string, term: string): boolean {
  const answer = hanOnly(typed)
  if (!answer) return false
  const forms = [term, ...term.split(/[\/／,，;；、|]/)].map(hanOnly).filter(Boolean)
  return forms.includes(answer)
}
