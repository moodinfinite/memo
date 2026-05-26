import { useState, useEffect, useCallback, useRef } from 'react'
import type { Card } from '@/lib/database.types'
import { useSRSStore } from '@/store/srsStore'
import { useSetsStore } from '@/store/setsStore'
import styles from './StoryCard.module.css'

interface Props {
  terms: Card[]
  setTitle: string
  setId: string
  onNewBatch: () => void
}

/** Split `text` into plain/highlighted segments for the given terms */
function buildSegments(text: string, terms: Card[]): { text: string; highlighted: boolean; definition?: string }[] {
  if (!terms.length) return [{ text, highlighted: false }]
  const sorted = [...terms].sort((a, b) => b.term.length - a.term.length)
  const escaped = sorted.map(t => t.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const regex = new RegExp(`(${escaped.join('|')})`, 'gi')
  const parts = text.split(regex)
  const termMap = new Map(terms.map(t => [t.term.toLowerCase(), t.definition]))
  return parts.map(part => {
    const def = termMap.get(part.toLowerCase())
    return def !== undefined ? { text: part, highlighted: true, definition: def } : { text: part, highlighted: false }
  })
}

export default function StoryCard({ terms, setId, setTitle, onNewBatch }: Props) {
  const [story, setStory] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tooltip, setTooltip] = useState<{ term: string; def: string } | null>(null)
  const [selection, setSelection] = useState<string>('')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'loading' | 'saved' | 'error'>('idle')
  const tappedIds = useRef<Set<string>>(new Set())
  const storyRef = useRef('')
  const storyElRef = useRef<HTMLParagraphElement>(null)
  const { saveToSavedWords } = useSetsStore()

  useEffect(() => { storyRef.current = story }, [story])

  // On unmount: log mastery signals
  useEffect(() => {
    return () => {
      if (!storyRef.current) return
      const updateSRS = useSRSStore.getState().updateSRS
      terms.forEach(t => updateSRS(t.id, setId, !tappedIds.current.has(t.id)))
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Detect text selection within the story paragraph
  useEffect(() => {
    const handleSelectionChange = () => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || !storyElRef.current) { setSelection(''); return }
      const range = sel.getRangeAt(0)
      if (!storyElRef.current.contains(range.commonAncestorContainer)) { setSelection(''); return }
      const word = sel.toString().trim()
      if (word) { setSelection(word); setSaveStatus('idle') }
      else setSelection('')
    }
    document.addEventListener('selectionchange', handleSelectionChange)
    return () => document.removeEventListener('selectionchange', handleSelectionChange)
  }, [])

  const handleSaveWord = async () => {
    if (!selection || saveStatus === 'loading') return
    setSaveStatus('loading')
    try {
      const res = await fetch('/api/lookup-word', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ word: selection }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      await saveToSavedWords(selection, data.definition)
      setSaveStatus('saved')
      window.getSelection()?.removeAllRanges()
      setSelection('')
      setTimeout(() => setSaveStatus('idle'), 2000)
    } catch {
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 2500)
    }
  }

  const generate = useCallback(async () => {
    tappedIds.current.clear()
    setLoading(true)
    setError(null)
    setStory('')
    setTooltip(null)
    setSelection('')
    try {
      const res = await fetch('/api/generate-story', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ setTitle, terms: terms.map(t => ({ term: t.term, definition: t.definition })) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to generate story')
      setStory(data.story)
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }, [terms, setTitle])

  useEffect(() => { generate() }, [generate])

  const segments = story ? buildSegments(story, terms) : []

  return (
    <div className={styles.wrap}>
      {/* Story card */}
      <div className={styles.card}>
        {loading && (
          <div className={styles.loadingState}>
            <svg className={styles.spinner} width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="11" cy="11" r="8" strokeOpacity="0.2"/>
              <path d="M11 3a8 8 0 0 1 8 8" strokeLinecap="round"/>
            </svg>
            <span>Writing your story…</span>
          </div>
        )}
        {error && (
          <div className={styles.errorState}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="9" cy="9" r="7"/><path d="M9 6v4M9 12.5v.5"/></svg>
            {error}
          </div>
        )}
        {story && (
          <p className={styles.storyText} ref={storyElRef}>
            {segments.map((seg, i) =>
              seg.highlighted ? (
                <mark
                  key={i}
                  className={[styles.highlight, tooltip?.term === seg.text.toLowerCase() ? styles.highlightActive : ''].join(' ')}
                  onClick={() => {
                    const termObj = terms.find(t => t.term.toLowerCase() === seg.text.toLowerCase())
                    if (termObj) tappedIds.current.add(termObj.id)
                    setTooltip(t => t?.term === seg.text.toLowerCase() ? null : { term: seg.text.toLowerCase(), def: seg.definition! })
                  }}
                >
                  {seg.text}
                </mark>
              ) : (
                <span key={i}>{seg.text}</span>
              )
            )}
          </p>
        )}

        {/* Selection save bar — slides up when text is selected */}
        {selection && story && (
          <div className={styles.saveBar}>
            <span className={styles.saveBarWord}>「{selection}」</span>
            <button
              className={styles.saveBarBtn}
              onClick={handleSaveWord}
              disabled={saveStatus === 'loading'}
            >
              {saveStatus === 'loading' && 'Looking up…'}
              {saveStatus === 'saved' && '✓ Saved'}
              {saveStatus === 'error' && 'Failed — try again'}
              {saveStatus === 'idle' && '+ Save to deck'}
            </button>
            <button className={styles.saveBarDismiss} onClick={() => { window.getSelection()?.removeAllRanges(); setSelection('') }}>
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M1 1l9 9M10 1L1 10"/></svg>
            </button>
          </div>
        )}
      </div>

      {/* Tooltip / definition reveal */}
      {tooltip && (
        <div className={styles.tooltipCard} onClick={() => setTooltip(null)}>
          <span className={styles.tooltipTerm}>{tooltip.term}</span>
          <span className={styles.tooltipDef}>{tooltip.def}</span>
          <button className={styles.tooltipClose} onClick={() => setTooltip(null)}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M1 1l10 10M11 1L1 11"/></svg>
          </button>
        </div>
      )}

      {/* Terms chips */}
      {story && (
        <div className={styles.termsRow}>
          <span className={styles.termsLabel}>Terms in this story</span>
          <div className={styles.termChips}>
            {terms.map(t => (
              <button
                key={t.id}
                className={[styles.termChip, tooltip?.term === t.term.toLowerCase() ? styles.termChipActive : ''].join(' ')}
                onClick={() => {
                  tappedIds.current.add(t.id)
                  setTooltip(v => v?.term === t.term.toLowerCase() ? null : { term: t.term.toLowerCase(), def: t.definition })
                }}
              >
                {t.term}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Regenerate / New batch */}
      {!loading && (
        <div className={styles.actionRow}>
          <button className={styles.regenBtn} onClick={generate} disabled={loading}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 7A6 6 0 0 1 12.5 4M13 1v3h-3"/>
              <path d="M13 7A6 6 0 0 1 1.5 10M1 13v-3h3"/>
            </svg>
            New story, same words
          </button>
          <button className={styles.newBatchBtn} onClick={onNewBatch}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 4h9M1 7h7M1 10h5"/><path d="M11 8l2 2-2 2"/>
            </svg>
            New batch
          </button>
        </div>
      )}
    </div>
  )
}
