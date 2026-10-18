const han = /\p{Script=Han}/u

/** `lang` for text containing Chinese characters, so styles can size it with :lang(zh) */
export const chineseLang = (text: string) => (han.test(text) ? 'zh-Hant' : undefined)

/** Size bucket for a term on a card: one or two characters read best very large, phrases smaller */
export const termLength = (text: string) => {
  const count = [...text.trim()].length
  return count <= 2 ? 'short' : count <= 4 ? 'medium' : 'long'
}
