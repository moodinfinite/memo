import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { Card } from '@/lib/database.types'
import { useSetsStore } from '@/store/setsStore'
import { supabase } from '@/lib/supabase'
import { cardDefinition, loadDictionary, lookupText, type LookupPart } from '@/lib/dictionary'
import styles from './StoryCard.module.css'

const MAX_LOOKUP_ROWS = 4

interface Props {
  terms: Card[]
  setTitle: string
  setId: string
  onNewBatch: () => void
  onComplete?: () => void   // when set, shows "Continue →" button (used in learn mode)
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

export default function StoryCard({ terms, setTitle, onNewBatch, onComplete }: Props) {
  const [story, setStory] = useState('')
  const [loading, setLoading] = useState(false)
  const [slowLoad, setSlowLoad] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tooltip, setTooltip] = useState<{ term: string; def: string } | null>(null)
  const [selectedWord, setSelectedWord] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'loading' | 'saved' | 'error'>('idle')
  const [lookup, setLookup] = useState<{ status: 'loading' } | { status: 'ready'; parts: LookupPart[] } | { status: 'error' }>({ status: 'loading' })
  const [lookupAttempt, setLookupAttempt] = useState(0)
  const storyElRef = useRef<HTMLParagraphElement>(null)
  const saveBarRef = useRef<HTMLDivElement>(null)
  const { saveToSavedWords } = useSetsStore()

  // Reading and dictionary lookups are not recall tests. Only explicit study answers update SRS.

  // Watch for text selection inside the story. The save bar is a fixed
  // snackbar at the bottom of the screen — no coordinate math, so it can
  // never drift out of the viewport. Once shown, it keeps the word in state
  // and stays up until the user saves, dismisses, or taps elsewhere; it
  // does NOT depend on the browser selection staying alive.
  useEffect(() => {
    const onPointerUp = (e: MouseEvent | TouchEvent) => {
      // Taps on the save bar itself never change or hide it
      if (saveBarRef.current?.contains(e.target as Node)) return
      // rAF lets the browser finalise the selection before we read it
      requestAnimationFrame(() => {
        const sel = window.getSelection()
        if (sel && !sel.isCollapsed && storyElRef.current) {
          const range = sel.getRangeAt(0)
          if (storyElRef.current.contains(range.commonAncestorContainer)) {
            const word = sel.toString().trim()
            if (word && word.length <= 40) {
              setSelectedWord(word)
              setSaveStatus('idle')
              return
            }
          }
        }
        // Tapped elsewhere with no valid selection — hide
        setSelectedWord(null)
        setSaveStatus('idle')
      })
    }
    document.addEventListener('mouseup', onPointerUp)
    document.addEventListener('touchend', onPointerUp)
    return () => {
      document.removeEventListener('mouseup', onPointerUp)
      document.removeEventListener('touchend', onPointerUp)
    }
  }, [])

  // Offline dictionary lookup for the selection (downloaded once, on first use)
  useEffect(() => {
    if (!selectedWord) return
    let current = true
    setLookup({ status: 'loading' })
    loadDictionary()
      .then(dict => { if (current) setLookup({ status: 'ready', parts: lookupText(dict, selectedWord) }) })
      .catch(() => { if (current) setLookup({ status: 'error' }) })
    return () => { current = false }
  }, [selectedWord, lookupAttempt])

  const lookupParts = lookup.status === 'ready' ? lookup.parts : []
  const definition = cardDefinition(lookupParts)

  const handleSaveWord = async () => {
    if (!definition || saveStatus === 'loading') return
    setSaveStatus('loading')
    try {
      await saveToSavedWords(lookupParts.map(part => part.word).join(''), definition)
      setSaveStatus('saved')
      setTimeout(() => { window.getSelection()?.removeAllRanges(); setSelectedWord(null); setSaveStatus('idle') }, 1200)
    } catch {
      setSaveStatus('error')
      // No auto-dismiss — user can explicitly retry or dismiss
    }
  }

  const generate = useCallback(async () => {
    setLoading(true)
    setSlowLoad(false)
    setError(null)
    setStory('')
    setTooltip(null)
    setSelectedWord(null)
    const controller = new AbortController()
    const slowWarn = setTimeout(() => setSlowLoad(true), 8000)
    const deadline = setTimeout(() => controller.abort(), 22000)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/generate-story', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'authorization': `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ setTitle, terms: terms.map(t => ({ term: t.term, definition: t.definition })) }),
        signal: controller.signal,
      })
      const text = await res.text()
      let data: any
      try { data = JSON.parse(text) } catch { throw new Error('Story generation timed out — tap to try again') }
      if (!res.ok) throw new Error(data.error || 'Failed to generate story')
      setStory(data.story)
    } catch (err: any) {
      const msg = err.name === 'AbortError' ? 'Taking too long — tap to try again' : (err.message ?? 'Something went wrong')
      setError(msg)
    } finally {
      clearTimeout(slowWarn)
      clearTimeout(deadline)
      setLoading(false)
      setSlowLoad(false)
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
            <span>{slowLoad ? 'Still writing — almost there…' : 'Writing your story…'}</span>
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
                  setTooltip(v => v?.term === t.term.toLowerCase() ? null : { term: t.term.toLowerCase(), def: t.definition })
                }}
              >
                {t.term}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Dictionary card for the selection, pinned to the bottom of the screen. Rendered into
          <body>: the story wrapper's entrance animation leaves a transform, which would
          otherwise make it the frame for position: fixed. */}
      {selectedWord && story && createPortal(
        <div ref={saveBarRef} className={styles.lookupCard} role="dialog" aria-label={`Dictionary: ${selectedWord}`}>
          <button className={styles.floatingSaveDismiss} aria-label="Close" onClick={() => { window.getSelection()?.removeAllRanges(); setSelectedWord(null); setSaveStatus('idle') }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M1 1l8 8M9 1L1 9"/></svg>
          </button>
          {lookup.status === 'loading' && (
            <div className={styles.lookupStatus}>
              <svg className={styles.floatingSaveSpinner} width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="5.5" cy="5.5" r="4" strokeOpacity="0.25"/><path d="M5.5 1.5a4 4 0 0 1 4 4" strokeLinecap="round"/></svg>
              Looking up 「{selectedWord}」…
            </div>
          )}
          {lookup.status === 'error' && (
            <div className={styles.lookupStatus}>
              The dictionary didn't load.
              <button className={[styles.floatingSaveBtn, styles.floatingSaveBtnRetry].join(' ')} onClick={() => setLookupAttempt(n => n + 1)}>Retry</button>
            </div>
          )}
          {lookup.status === 'ready' && (
            <ul className={styles.lookupRows}>
              {(lookupParts.length === 1
                ? lookupParts[0].entries.slice(0, 2).map(entry => ({ word: lookupParts[0].word, entry }))
                : lookupParts.slice(0, MAX_LOOKUP_ROWS).map(part => ({ word: part.word, entry: part.entries[0] }))
              ).map(({ word, entry }, i) => (
                <li key={i} className={styles.lookupRow}>
                  <span className={styles.lookupWord} lang="zh-Hant">{word}</span>
                  <span className={styles.lookupText}>
                    {entry ? <><span className={styles.lookupPinyin}>{entry.pinyin}</span>{entry.meaning}</> : 'Not in the dictionary'}
                  </span>
                </li>
              ))}
              {lookupParts.length === 1 && !lookupParts[0].entries.length && (
                <li className={styles.lookupRow}><span className={styles.lookupWord} lang="zh-Hant">{lookupParts[0].word}</span><span className={styles.lookupText}>Not in the dictionary</span></li>
              )}
              {lookupParts.length > MAX_LOOKUP_ROWS && <li className={styles.lookupMore}>+{lookupParts.length - MAX_LOOKUP_ROWS} more words</li>}
              {!lookupParts.length && <li className={styles.lookupText}>Select Chinese characters to look them up.</li>}
            </ul>
          )}
          <div className={styles.lookupFooter}>
            {saveStatus === 'error' ? (
              <button className={[styles.floatingSaveBtn, styles.floatingSaveBtnRetry].join(' ')} onClick={handleSaveWord}>Couldn't save — retry</button>
            ) : (
              <button
                className={[styles.floatingSaveBtn, saveStatus === 'saved' ? styles.floatingSaveBtnSaved : ''].join(' ')}
                onClick={handleSaveWord}
                disabled={!definition || saveStatus === 'loading' || saveStatus === 'saved'}
              >
                {saveStatus === 'loading' && 'Saving…'}
                {saveStatus === 'saved' && '✓ Saved'}
                {saveStatus === 'idle' && '+ Save to deck'}
              </button>
            )}
            <a className={styles.lookupCredit} href="https://www.mdbg.net/chinese/dictionary?page=cc-cedict" target="_blank" rel="noreferrer">CC-CEDICT</a>
          </div>
        </div>,
        document.body,
      )}

      {/* Regenerate / New batch / Continue */}
      {!loading && (
        <div className={styles.actionRow}>
          <button className={styles.regenBtn} onClick={generate} disabled={loading}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 7A6 6 0 0 1 12.5 4M13 1v3h-3"/>
              <path d="M13 7A6 6 0 0 1 1.5 10M1 13v-3h3"/>
            </svg>
            New story, same words
          </button>
          {onComplete ? (
            <button className={styles.newBatchBtn} onClick={onComplete}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 7h8M7 3l4 4-4 4"/>
              </svg>
              Continue
            </button>
          ) : (
            <button className={styles.newBatchBtn} onClick={onNewBatch}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 4h9M1 7h7M1 10h5"/><path d="M11 8l2 2-2 2"/>
              </svg>
              New batch
            </button>
          )}
        </div>
      )}
    </div>
  )
}
