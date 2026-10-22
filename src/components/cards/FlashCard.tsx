import QuickEditCard from '@/components/study/QuickEditCard'
import { useState, useEffect, useRef } from 'react'
import type { Card } from '@/lib/database.types'
import { chineseLang, termLength, writingMatches } from '@/lib/cjk'
import SpeakButton from '@/components/ui/SpeakButton'
import styles from './FlashCard.module.css'

interface Props {
  card: Card
  index: number
  total: number
  onKnow: () => void
  onDontKnow: () => void
  onAnswerStart?: (correct: boolean) => void   // fires instantly on tap, before the flash delay
  onUndo?: () => void
  canUndo?: boolean
  flipKey?: number
  startSide?: 'term' | 'definition' | 'random'
}

const writeKey = 'memo-flash-write'

export default function FlashCard({ card, index, total, onKnow, onDontKnow, onAnswerStart, onUndo, canUndo, flipKey, startSide = 'term' }: Props) {
  // Decide once on mount which content goes on which face.
  // Always start flipped=false so the front face (neutral styling) is shown first.
  // When definition-first, we put definition content on the front face and term on the back.
  const defFirst = useRef(
    startSide === 'definition' || (startSide === 'random' && Math.random() > 0.5)
  ).current

  const frontLabel    = defFirst ? 'Definition' : 'Term'
  const frontContent  = defFirst ? card.definition : card.term
  const backLabel     = defFirst ? 'Term' : 'Definition'
  const backContent   = defFirst ? card.term : card.definition

  const [flipped, setFlipped] = useState(false)
  const [flash, setFlash] = useState<'correct' | 'incorrect' | null>(null)

  // Recall by writing: when the definition faces up and the hidden side is Chinese,
  // type or handwrite the answer, then check it against the card.
  const canWrite = defFirst && !!chineseLang(backContent)
  const [writeOn, setWriteOn] = useState(() => { try { return localStorage.getItem(writeKey) === 'on' } catch { return false } })
  const [typed, setTyped] = useState('')
  const [checked, setChecked] = useState<boolean | null>(null)
  const writeInput = useRef<HTMLInputElement>(null)
  const setWriting = (on: boolean) => {
    setWriteOn(on)
    try { localStorage.setItem(writeKey, on ? 'on' : 'off') } catch { /* Still works for this visit. */ }
    if (on) setTimeout(() => writeInput.current?.focus(), 0)
  }

  const answerTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (answerTimer.current) clearTimeout(answerTimer.current) }, [card.id])
  const mounted = useRef(false)
  const answering = flash !== null

  const handleFlip = () => { if (!answering) setFlipped((f) => !f) }

  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return }
    if ((flipKey ?? 0) > 0) setFlipped((f) => !f)
  }, [flipKey])

  // Safety net: if the component somehow doesn't unmount after a flash, clear it
  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 1100)
    return () => clearTimeout(t)
  }, [flash])

  const handleKnow = () => {
    if (answering) return
    setFlash('correct')
    onAnswerStart?.(true)
    answerTimer.current = setTimeout(onKnow, 1000)   // matches MC's 1s answer-feedback rhythm
  }

  const handleDontKnow = () => {
    if (answering) return
    setFlash('incorrect')
    onAnswerStart?.(false)
    answerTimer.current = setTimeout(onDontKnow, 1000)
  }

  // First Enter checks and flips; a second Enter accepts the suggested answer
  const submitWriting = (e: React.FormEvent) => {
    e.preventDefault()
    if (answering) return
    if (checked === null) { setChecked(writingMatches(typed, backContent)); setFlipped(true) }
    else if (checked) handleKnow()
    else handleDontKnow()
  }

  return (
    <div className={styles.wrap}>
      <QuickEditCard card={card} disabled={answering} />
      {/* Card */}
      <div className={styles.cardArea} onClick={handleFlip}>
        {flash && <div className={[styles.flashOverlay, flash === 'correct' ? styles.flashCorrect : styles.flashIncorrect].join(' ')} />}
        <div className={[styles.scene, flipped ? styles.flipped : ''].join(' ')}>
          <div className={[styles.face, styles.front].join(' ')}>
            <div className={styles.sideLabel}>{frontLabel}</div>
            {!flipped && <SpeakButton text={frontContent} className={styles.faceSpeak} />}
            <div className={styles.content} lang={chineseLang(frontContent)} data-length={termLength(frontContent)}>{frontContent}</div>
            <div className={styles.tapHint}>tap to flip</div>
          </div>
          <div className={[styles.face, styles.back].join(' ')}>
            <div className={styles.sideLabel}>{backLabel}</div>
            {flipped && <SpeakButton text={backContent} className={styles.faceSpeak} />}
            <div className={styles.content} lang={chineseLang(backContent)} data-length={termLength(backContent)}>{backContent}</div>
            <div className={styles.tapHint}>tap to flip back</div>
          </div>
        </div>
      </div>

      {canWrite && !writeOn && (
        <button type="button" className={styles.writeToggle} onClick={() => setWriting(true)} disabled={answering}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"><path d="M9.5 2.5l2 2L5 11l-2.5.5L3 9z"/></svg>
          Write it
        </button>
      )}
      {canWrite && writeOn && (
        <form className={styles.writeForm} onSubmit={submitWriting}>
          <div className={styles.writeRow}>
            <input ref={writeInput} className={styles.writeInput} lang="zh-Hant" value={typed}
              onChange={e => { setTyped(e.target.value); if (checked !== null) setChecked(null) }}
              placeholder="Write the Chinese…" aria-label="Write the term" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
              readOnly={answering} autoFocus />
            <button type="submit" className={styles.writeCheck} disabled={answering}>{checked === null ? 'Check' : 'Next'}</button>
            <button type="button" className={styles.writeClose} onClick={() => setWriting(false)} aria-label="Stop writing answers" title="Stop writing answers">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 2l8 8M10 2L2 10"/></svg>
            </button>
          </div>
          {checked !== null && (
            <div className={[styles.writeResult, checked ? styles.writeRight : styles.writeWrong].join(' ')} role="status">
              {checked ? <>✓ Matches</> : typed.trim() ? <>You wrote <span lang="zh-Hant">{typed.trim()}</span> · answer <span lang="zh-Hant">{backContent}</span></> : <>Answer: <span lang="zh-Hant">{backContent}</span></>}
            </div>
          )}
        </form>
      )}

      {/* Actions */}
      <div className={styles.actions}>
        <button className={`${styles.dontKnow}${answering ? ' ' + styles.answeringBtn : ''}${checked === false ? ' ' + styles.suggested : ''}`} onClick={handleDontKnow} disabled={answering}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M2 2l12 12M14 2L2 14" />
          </svg>
          Still learning
        </button>
        <button className={`${styles.know}${answering ? ' ' + styles.answeringBtn : ''}${checked === true ? ' ' + styles.suggested : ''}`} onClick={handleKnow} disabled={answering}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M2 8l4 4 8-8" />
          </svg>
          Got it
        </button>
      </div>

      {/* Undo last card */}
      {canUndo && (
        <button
          className={`${styles.undoBtn}${answering ? ' ' + styles.answeringBtn : ''}`}
          onClick={!answering ? onUndo : undefined}
          disabled={answering}
          title="Undo last answer"
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M2 5h6a4 4 0 0 1 0 8H5M2 5l3-3M2 5l3 3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Undo last
        </button>
      )}
    </div>
  )
}
