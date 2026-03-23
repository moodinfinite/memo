import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSetsStore } from '@/store/setsStore'
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
          <label className={styles.label}>Title</label>
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
          <span className={styles.sectionLabel}>Cards</span>
          <span className={styles.cardCount}>{rows.length}</span>
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
    </div>
  )
}
