import { canSpeak, speakChinese } from '@/lib/speech'
import { chineseLang } from '@/lib/cjk'
import styles from './SpeakButton.module.css'

/** Speaker icon that reads Chinese text aloud; renders nothing for non-Chinese text or unsupported browsers */
export default function SpeakButton({ text, className = '' }: { text: string; className?: string }) {
  if (!canSpeak() || !chineseLang(text)) return null
  return (
    <button
      type="button"
      className={[styles.speak, className].join(' ')}
      aria-label={`Hear ${text}`}
      title="Hear pronunciation"
      // Cards flip on click; the button must not
      onClick={e => { e.stopPropagation(); speakChinese(text) }}
      onPointerDown={e => e.stopPropagation()}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2.5 6h2.2L8 3.2v9.6L4.7 10H2.5z" />
        <path d="M10.6 5.6a3.2 3.2 0 0 1 0 4.8M12.5 3.8a5.8 5.8 0 0 1 0 8.4" />
      </svg>
    </button>
  )
}
