import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSetsStore } from '@/store/setsStore'
import { supabase } from '@/lib/supabase'
import ImportModal from '@/components/ui/ImportModal'
import TitleAI from '@/components/ui/TitleAI'
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
  const [canRetry, setCanRetry] = useState(false)
  const [dbStatus, setDbStatus] = useState<'warming' | 'ready'>('warming')

  // Warm up the DB connection as soon as the page loads so it's ready by the time the user hits Save
  useEffect(() => {
    supabase.from('sets').select('id').limit(1).then(() => setDbStatus('ready'))
  }, [])

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
    setError('')
    setCanRetry(false)
    // Warn at 8s (cold start), give up at 25s
    const slowTimer = setTimeout(() => setError('Taking longer than usual — almost there…'), 8000)
    const failTimer = setTimeout(() => { setSaving(false); setError('Connection timed out — tap Retry'); setCanRetry(true) }, 25000)
    try {
      const set = await createSet(title.trim(), description.trim(), validCards)
      clearTimeout(slowTimer); clearTimeout(failTimer)
      navigate(`/sets/${set.id}`)
    } catch (err: any) {
      clearTimeout(slowTimer); clearTimeout(failTimer)
      console.error('[NewSetPage] createSet failed:', err)
      const msg = err?.message ?? err?.error_description ?? JSON.stringify(err)
      setError(`Failed to save: ${msg}`)
      setCanRetry(true)
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
          {dbStatus === 'warming' && (
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <svg style={{ animation: 'spin 1s linear infinite' }} width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="5.5" cy="5.5" r="4" strokeOpacity="0.25"/><path d="M5.5 1.5a4 4 0 0 1 4 4" strokeLinecap="round"/></svg>
              Connecting…
            </span>
          )}
          {dbStatus === 'ready' && (
            <span style={{ fontSize: 12, color: 'var(--accent-text)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 5.5l2.5 2.5 4.5-4.5"/></svg>
              Ready
            </span>
          )}
          <button className={styles.cancelBtn} onClick={() => navigate(-1)}>Cancel</button>
          <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save set'}
          </button>
        </div>
      </div>

      {error && (
        <div className={styles.error} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span>{error}</span>
          {canRetry && <button onClick={handleSave} style={{ flexShrink: 0, padding: '4px 12px', borderRadius: 6, border: '1px solid currentColor', background: 'transparent', color: 'inherit', fontFamily: 'var(--font)', fontSize: 12, cursor: 'pointer' }}>Retry</button>}
        </div>
      )}

      {/* Set metadata */}
      <div className={styles.metaCard}>
        <div className={styles.field}>
          <div className={styles.labelRow}>
            <label className={styles.label}>Title</label>
            <TitleAI cards={rows} onSelect={setTitle} />
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
