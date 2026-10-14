import { useEffect, useId, useRef, useState } from 'react'
import type { Card } from '@/lib/database.types'
import { useSetsStore } from '@/store/setsStore'
import { useStudyStore } from '@/store/studyStore'
import styles from './QuickEditCard.module.css'

export default function QuickEditCard({ card, disabled = false }: { card: Card; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  return <>
    <div className={styles.row}><button className={styles.edit} disabled={disabled} onClick={() => setOpen(true)} title="Edit this card without leaving your session">
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m3 10 7-7 3 3-7 7-4 1 1-4ZM9 4l3 3"/></svg>Edit card
    </button></div>
    {open && <Editor card={card} onClose={() => setOpen(false)} />}
  </>
}
function Editor({ card, onClose }: { card: Card; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const id = useId()
  const [term, setTerm] = useState(card.term)
  const [definition, setDefinition] = useState(card.definition)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const sessionId = useRef(useStudyStore.getState().sessionId).current
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    useStudyStore.setState({ editingCard: true })
    dialog.current?.showModal()
    return () => {
      if (useStudyStore.getState().sessionId === sessionId) useStudyStore.setState({ editingCard: false })
      previousFocus?.focus()
    }
  }, [sessionId])
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); if (saving) return
    setSaving(true); setError('')
    try {
      const updated = await useSetsStore.getState().updateCard(card, term, definition)
      if (useStudyStore.getState().sessionId === sessionId) useStudyStore.getState().replaceCard(updated)
      onClose()
    } catch (err) { setError(err instanceof Error ? err.message : 'Card could not be saved. Please try again.'); setSaving(false) }
  }
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby={`${id}-title`}
    onCancel={event => { event.preventDefault(); if (!saving) onClose() }} onKeyDown={event => event.stopPropagation()}>
    <form onSubmit={save}>
      <h2 id={`${id}-title`}>Edit card</h2><p>Your session is paused. Your place and learning history stay the same.</p>
      <label htmlFor={`${id}-term`}>Term</label>
      <textarea id={`${id}-term`} autoFocus value={term} onChange={event => setTerm(event.target.value)} maxLength={500} rows={2} required disabled={saving}/>
      <label htmlFor={`${id}-definition`}>Definition</label>
      <textarea id={`${id}-definition`} value={definition} onChange={event => setDefinition(event.target.value)} maxLength={2000} rows={4} required disabled={saving}/>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.actions}><button type="button" onClick={onClose} disabled={saving}>Cancel</button><button className={styles.save} disabled={saving || !term.trim() || !definition.trim()}>{saving ? 'Saving…' : 'Save & continue'}</button></div>
    </form>
  </dialog>
}
