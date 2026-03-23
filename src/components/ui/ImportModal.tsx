import { useState } from 'react'
import { parseTabSeparated } from '@/lib/importParser'
import { useSetsStore } from '@/store/setsStore'
import styles from './ImportModal.module.css'

interface Props {
  setId?: string
  onImportLocal?: (cards: { term: string; definition: string }[]) => void
  onClose: () => void
  onSuccess?: (count: number) => void
}

export default function ImportModal({ setId, onImportLocal, onClose, onSuccess }: Props) {
  const { importCards } = useSetsStore()
  const [raw, setRaw] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [importing, setImporting] = useState(false)

  const parsed = raw.trim() ? parseTabSeparated(raw) : { cards: [], errors: [] }
  const hasCards = parsed.cards.length > 0

  const handleImport = async () => {
    const result = parseTabSeparated(raw)
    if (result.cards.length === 0) return

    if (onImportLocal) {
      onImportLocal(result.cards.map(c => ({ term: c.term, definition: c.definition })))
      onClose()
      return
    }

    setImporting(true)
    try {
      await importCards(setId!, result.cards)
      onSuccess?.(result.cards.length)
      onClose()
    } catch {
      setErrors(['Import failed — please try again'])
      setImporting(false)
    }
  }

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.title}>Import cards</div>
          <button className={styles.closeBtn} onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 2l12 12M14 2L2 14"/>
            </svg>
          </button>
        </div>

        <div className={styles.instructions}>
          Paste tab-separated text — one card per line.
          <code className={styles.example}>Term[Tab]Definition</code>
          Works with exports from Quizlet, Anki, Excel, and Google Sheets.
        </div>

        <textarea
          className={styles.textarea}
          value={raw}
          onChange={(e) => { setRaw(e.target.value); setErrors([]) }}
          placeholder={"Sunk cost fallacy\tContinuing a behavior due to past investment…\nOpportunity cost\tThe value of the next best alternative…"}
          rows={10}
          autoFocus
        />

        {parsed.errors.length > 0 && (
          <div className={styles.errorList}>
            {parsed.errors.slice(0, 5).map((e, i) => (
              <div key={i} className={styles.errorItem}>{e}</div>
            ))}
            {parsed.errors.length > 5 && (
              <div className={styles.errorItem}>…and {parsed.errors.length - 5} more issues</div>
            )}
          </div>
        )}

        <div className={styles.footer}>
          <div className={styles.preview}>
            {raw.trim()
              ? hasCards
                ? `${parsed.cards.length} card${parsed.cards.length === 1 ? '' : 's'} ready to import`
                : 'No valid cards found'
              : 'Paste your content above'
            }
          </div>
          <div className={styles.footerActions}>
            <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
            <button
              className={styles.importBtn}
              onClick={handleImport}
              disabled={!hasCards || importing}
            >
              {importing ? 'Importing…' : `Import ${hasCards ? parsed.cards.length : ''} cards`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
