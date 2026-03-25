import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSetsStore } from '@/store/setsStore'
import TitleAI from '@/components/ui/TitleAI'
import { SetDetailSkeleton } from '@/components/ui/Skeleton'
import styles from './NewSetPage.module.css'

interface CardRow {
  tempId: string
  id?: string
  term: string
  definition: string
  position: number
}

export default function EditSetPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { currentSet, fetchSet, updateSet } = useSetsStore()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [rows, setRows] = useState<CardRow[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (id) fetchSet(id)
  }, [id])

  useEffect(() => {
    if (currentSet) {
      setTitle(currentSet.title)
      setDescription(currentSet.description ?? '')
      setRows(
        currentSet.cards.map((c) => ({
          tempId: c.id,
          id: c.id,
          term: c.term,
          definition: c.definition,
          position: c.position,
        }))
      )
    }
  }, [currentSet?.id])

  const updateRow = (tempId: string, field: 'term' | 'definition', value: string) => {
    setRows((prev) => prev.map((r) => r.tempId === tempId ? { ...r, [field]: value } : r))
  }

  const addRow = () => {
    setRows((prev) => [...prev, { tempId: crypto.randomUUID(), term: '', definition: '', position: prev.length }])
  }

  const removeRow = (tempId: string) => {
    if (rows.length <= 2) return
    setRows((prev) => prev.filter((r) => r.tempId !== tempId))
  }

  const handleSave = async () => {
    if (!title.trim()) { setError('Give your set a title'); return }
    const validCards = rows.filter((r) => r.term.trim() && r.definition.trim())
    if (validCards.length < 1) { setError('Add at least one complete card'); return }
    if (!id) return

    setSaving(true)
    setError('')
    const timer = setTimeout(() => { setSaving(false); setError('Save timed out — check your connection and try again') }, 15000)
    try {
      await updateSet(id, title.trim(), description.trim(), validCards as never)
      clearTimeout(timer)
      navigate(`/sets/${id}`)
    } catch {
      clearTimeout(timer)
      setError('Failed to save — please try again')
      setSaving(false)
    }
  }

  if (!currentSet) return <SetDetailSkeleton />

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Edit set</h1>
          <p className={styles.sub}>Update your terms and definitions</p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.cancelBtn} onClick={() => navigate(`/sets/${id}`)}>Cancel</button>
          <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.metaCard}>
        <div className={styles.field}>
          <div className={styles.labelRow}>
            <label className={styles.label}>Title</label>
            <TitleAI cards={rows} onSelect={setTitle} />
          </div>
          <input className={styles.input} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Description <span className={styles.optional}>(optional)</span></label>
          <input className={styles.input} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
      </div>

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
                  <textarea className={styles.textarea} value={row.term} onChange={(e) => updateRow(row.tempId, 'term', e.target.value)} rows={2} />
                </div>
                <div className={styles.rowDivider} />
                <div className={styles.rowField}>
                  <div className={styles.fieldLabel}>Definition</div>
                  <textarea className={styles.textarea} value={row.definition} onChange={(e) => updateRow(row.tempId, 'definition', e.target.value)} rows={2} />
                </div>
              </div>
              <button className={styles.removeBtn} onClick={() => removeRow(row.tempId)} disabled={rows.length <= 2}>
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
