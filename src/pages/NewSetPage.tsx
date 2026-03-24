import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSetsStore } from '@/store/setsStore'
import ImportModal from '@/components/ui/ImportModal'
import styles from './NewSetPage.module.css'

interface CardRow {
  tempId: string
  term: string
  definition: string
  position: number
}

function makeRow(position: number): CardRow {
  return { tempId: crypto.randomUUID(), term: '', definition: '', position }
}

export default function NewSetPage() {
  const navigate = useNavigate()
  const { createSet } = useSetsStore()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [rows, setRows] = useState<CardRow[]>([makeRow(0), makeRow(1)])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [generatingTitle, setGeneratingTitle] = useState(false)

  const handleGenerateTitle = async () => {
    const filledCards = rows.filter(r => r.term.trim() && r.definition.trim())
    if (filledCards.length === 0) return
    setGeneratingTitle(true)
    try {
      const res = await fetch('/api/generate-title', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cards: filledCards.map(r => ({ term: r.term, definition: r.definition })) }),
      })
      const data = await res.json()
      if (data.title) setTitle(data.title)
    } finally {
      setGeneratingTitle(false)
    }
  }

  const handleImportLocal = (imported: { term: string; definition: string }[]) => {
    const existingFilled = rows.filter(r => r.term.trim() || r.definition.trim())
    const newRows = imported.map((c, i) =>
      ({ tempId: crypto.randomUUID(), term: c.term, definition: c.definition, position: existingFilled.length + i })
    )
    setRows([...existingFilled, ...newRows])
  }

  const updateRow = (tempId: string, field: 'term' | 'definition', value: string) => {
    setRows((prev) => prev.map((r) => r.tempId === tempId ? { ...r, [field]: value } : r))
  }

  const addRow = () => {
    setRows((prev) => [...prev, makeRow(prev.length)])
  }

  const removeRow = (tempId: string) => {
    if (rows.length <= 2) return
    setRows((prev) => prev.filter((r) => r.tempId !== tempId))
  }

  const handleSave = async () => {
    if (!title.trim()) { setError('Give your set a title'); return }
    const validCards = rows.filter((r) => r.term.trim() && r.definition.trim())
    if (validCards.length < 1) { setError('Add at least one complete card'); return }

    setSaving(true)
    try {
      const set = await createSet(title.trim(), description.trim(), validCards)
      navigate(`/sets/${set.id}`)
    } catch {
      setError('Failed to save — please try again')
      setSaving(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>New set</h1>
          <p className={styles.sub}>Add your terms and definitions</p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.cancelBtn} onClick={() => navigate(-1)}>Cancel</button>
          <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save set'}
          </button>
        </div>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {/* Set metadata */}
      <div className={styles.metaCard}>
        <div className={styles.field}>
          <div className={styles.labelRow}>
            <label className={styles.label}>Title</label>
            <button
              type="button"
              className={styles.generateBtn}
              onClick={handleGenerateTitle}
              disabled={generatingTitle || rows.every(r => !r.term.trim())}
              title="Generate title with AI"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M6 1v2M6 9v2M1 6h2M9 6h2M2.5 2.5l1.5 1.5M8 8l1.5 1.5M2.5 9.5L4 8M8 4l1.5-1.5"/>
              </svg>
              {generatingTitle ? 'Generating…' : 'AI title'}
            </button>
          </div>
          <input
            className={styles.input}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Product management fundamentals"
            autoFocus
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Description <span className={styles.optional}>(optional)</span></label>
          <input
            className={styles.input}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this set for?"
          />
        </div>
      </div>

      {/* Card rows */}
      <div className={styles.cardsSection}>
        <div className={styles.cardsHeader}>
          <div className={styles.cardsHeaderLeft}>
            <span className={styles.sectionLabel}>Cards</span>
            <span className={styles.cardCount}>{rows.length}</span>
          </div>
          <button className={styles.importTriggerBtn} onClick={() => setShowImport(true)}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M6.5 1v8M3.5 6l3 3 3-3M1 10.5h11" />
            </svg>
            Import
          </button>
        </div>

        <div className={styles.cardList}>
          {rows.map((row, i) => (
            <div key={row.tempId} className={styles.cardRow}>
              <span className={styles.rowNum}>{i + 1}</span>
              <div className={styles.rowFields}>
                <div className={styles.rowField}>
                  <div className={styles.fieldLabel}>Term</div>
                  <textarea
                    className={styles.textarea}
                    value={row.term}
                    onChange={(e) => updateRow(row.tempId, 'term', e.target.value)}
                    placeholder="Enter term"
                    rows={2}
                  />
                </div>
                <div className={styles.rowDivider} />
                <div className={styles.rowField}>
                  <div className={styles.fieldLabel}>Definition</div>
                  <textarea
                    className={styles.textarea}
                    value={row.definition}
                    onChange={(e) => updateRow(row.tempId, 'definition', e.target.value)}
                    placeholder="Enter definition"
                    rows={2}
                  />
                </div>
              </div>
              <button
                className={styles.removeBtn}
                onClick={() => removeRow(row.tempId)}
                disabled={rows.length <= 2}
                title="Remove card"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M2 2l10 10M12 2L2 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>

        <button className={styles.addRowBtn} onClick={addRow}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M7 1v12M1 7h12" />
          </svg>
          Add card
        </button>
      </div>

      {showImport && (
        <ImportModal
          onImportLocal={handleImportLocal}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  )
}
