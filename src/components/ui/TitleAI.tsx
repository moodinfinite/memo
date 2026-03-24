import { useState, useRef, useEffect } from 'react'
import styles from './TitleAI.module.css'

interface Props {
  cards: { term: string; definition: string }[]
  onSelect: (title: string) => void
}

export default function TitleAI({ cards, onSelect }: Props) {
  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  const filledCards = cards.filter(c => c.term.trim() && c.definition.trim())

  const handleGenerate = async () => {
    if (filledCards.length === 0) return
    setLoading(true)
    setError(null)
    setSuggestions([])
    try {
      const res = await fetch('/api/generate-title', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cards: filledCards.slice(0, 12) }),
      })
      const data = await res.json()
      if (data.suggestions?.length) {
        setSuggestions(data.suggestions)
      } else {
        setError(data.detail || data.error || 'No suggestions returned')
      }
    } catch (e: any) {
      setError(e?.message || 'Network error')
    } finally {
      setLoading(false)
    }
  }

  const handlePick = (title: string) => {
    onSelect(title)
    setSuggestions([])
  }

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setSuggestions([])
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div className={styles.wrap} ref={ref}>
      <button
        type="button"
        className={styles.btn}
        onClick={handleGenerate}
        disabled={loading || filledCards.length === 0}
        title="Suggest titles with AI"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M6 1v2M6 9v2M1 6h2M9 6h2M2.5 2.5l1.5 1.5M8 8l1.5 1.5M2.5 9.5L4 8M8 4l1.5-1.5"/>
        </svg>
        {loading ? 'Thinking…' : 'Suggest titles'}
      </button>

      {(suggestions.length > 0 || error !== null) && (
        <div className={styles.dropdown}>
          {error && <div className={styles.errorMsg}>{error}</div>}
          {suggestions.map((s, i) => (
            <button key={i} className={styles.option} onClick={() => handlePick(s)}>
              <span className={styles.optionNum}>{i + 1}</span>
              <span className={styles.optionText}>{s}</span>
            </button>
          ))}
          <button className={styles.dismiss} onClick={() => setSuggestions([])}>Dismiss</button>
        </div>
      )}
    </div>
  )
}
