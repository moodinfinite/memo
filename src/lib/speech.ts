// Free pronunciation through the device's built-in speech voices (Web Speech API).
// Quality and voice vary by device; nothing is downloaded or sent anywhere.

// Mandarin first, Taiwan before mainland to match Traditional characters; zh-HK is Cantonese
const PREFERRED = ['zh-TW', 'cmn-Hant-TW', 'zh-CN', 'cmn-Hans-CN', 'zh']

export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window

function chineseVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices().filter(v => !/^zh-HK|^yue/i.test(v.lang))
  for (const lang of PREFERRED) {
    const match = voices.find(v => v.lang.replace('_', '-').toLowerCase().startsWith(lang.toLowerCase()))
    if (match) return match
  }
  return undefined
}

export function speakChinese(text: string) {
  if (!canSpeak() || !text.trim()) return
  const synth = window.speechSynthesis
  synth.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  const voice = chineseVoice()
  utterance.lang = voice?.lang ?? 'zh-TW'
  if (voice) utterance.voice = voice
  utterance.rate = 0.85
  synth.speak(utterance)
}
