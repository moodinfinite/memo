const han = /\p{Script=Han}/u

/** `lang` for text containing Chinese characters, so styles can size it with :lang(zh) */
export const chineseLang = (text: string) => (han.test(text) ? 'zh-Hant' : undefined)
