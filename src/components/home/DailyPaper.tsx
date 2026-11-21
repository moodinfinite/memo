import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { localDayStr } from '@/lib/localDate'
import { useAuthStore } from '@/store/authStore'
import { useSRSStore } from '@/store/srsStore'
import type { Card } from '@/lib/database.types'
import StoryCard from '@/components/cards/StoryCard'
import styles from './DailyPaper.module.css'

/** Words in each edition */
const WORDS = 8
const SUBJECT = 'Today’s news from a neighbourhood alley in Taiwan, written as a short local newspaper article'

interface Edition { ids: string[]; batch: number }
const editionKey = (user: string, day: string) => `memo-paper:${user}:${day}`
const readEdition = (key: string): Edition | null => {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? 'null')
    return v && Array.isArray(v.ids) && typeof v.batch === 'number' ? v : null
  } catch { return null }
}
const writeEdition = (key: string, e: Edition) => { try { localStorage.setItem(key, JSON.stringify(e)) } catch { /* fine for this visit */ } }
/** Whether today's paper has been marked read, on this device */
const readKey = (user: string, day: string) => `memo-paper-read:${user}:${day}`
const readFlag = (key: string) => { try { return localStorage.getItem(key) === '1' } catch { return false } }
const writeFlag = (key: string, on: boolean) => { try { on ? localStorage.setItem(key, '1') : localStorage.removeItem(key) } catch { /* fine for this visit */ } }

/**
 * The daily paper on Home: one short local-news story a day, written with the words you studied most
 * recently. The edition is kept for the day on this device, so it isn't rewritten on every visit.
 */
export default function DailyPaper() {
  const user = useAuthStore(s => s.user)
  const cardSRS = useSRSStore(s => s.cardSRS)
  const day = localDayStr(new Date())
  const key = user ? editionKey(user.id, day) : null

  // Most recently studied first
  const recent = useMemo(() => Object.values(cardSRS)
    .filter(r => r.last_seen_at)
    .sort((a, b) => b.last_seen_at.localeCompare(a.last_seen_at))
    .map(r => r.card_id), [cardSRS])

  const [read, setRead] = useState(false)
  useEffect(() => { setRead(user ? readFlag(readKey(user.id, day)) : false) }, [user?.id, day])
  const markRead = (on: boolean) => { if (!user) return; writeFlag(readKey(user.id, day), on); setRead(on) }

  const [edition, setEdition] = useState<Edition | null>(null)
  useEffect(() => {
    if (!key) return
    const saved = readEdition(key)
    if (saved) { setEdition(saved); return }
    if (!recent.length) return
    const fresh = { ids: recent.slice(0, WORDS), batch: 0 }
    writeEdition(key, fresh); setEdition(fresh)
  }, [key, recent.length > 0])

  const [cards, setCards] = useState<Card[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!edition?.ids.length) return
    let live = true
    setCards(null); setFailed(false)
    supabase.from('cards').select('*').in('id', edition.ids).then(({ data, error }: { data: Card[] | null; error: unknown }) => {
      if (!live) return
      if (error || !data) { setFailed(true); return }
      const order = new Map(edition.ids.map((id, i) => [id, i]))
      setCards([...data].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)))
    })
    return () => { live = false }
  }, [edition?.ids.join(), attempt])

  // Another edition: the next words back in what you've studied, wrapping round
  const nextEdition = () => {
    if (!key || !edition || !recent.length) return
    const batch = edition.batch + 1
    const pages = Math.max(1, Math.ceil(recent.length / WORDS))
    const start = (batch % pages) * WORDS
    const next = { ids: recent.slice(start, start + WORDS), batch }
    writeEdition(key, next); setEdition(next)
  }

  const date = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return <section className={styles.paper} aria-label="Daily paper">
    <header className={styles.masthead}>
      <div className={styles.dateline}><span>{date}</span><span>{edition && edition.batch > 0 ? `Edition ${edition.batch + 1}` : 'Morning edition'}</span></div>
      <h2 className={styles.name} lang="zh-Hant">巷口日報</h2>
      {read && <span className={styles.stamp} aria-label="Read today"><span lang="zh-Hant">已讀</span>Read</span>}
      <div className={styles.sub}>The Lane Daily · today’s news, written with your words</div>
    </header>
    <div className={styles.body}>
      {!user ? null
        : !edition && !recent.length ? <p className={styles.note}>Nothing to print yet. Study a few words and tomorrow’s paper is written with them.</p>
        : failed ? <p className={styles.note}>The paper didn’t arrive. <button type="button" className={styles.retry} onClick={() => setAttempt(n => n + 1)}>Try again</button></p>
        : !cards ? <p className={styles.note}>Printing…</p>
        : <StoryCard key={`${day}:${edition!.batch}`} terms={cards} setId="" setTitle={SUBJECT}
            cacheKey={`paper:${user.id}:${day}:${edition!.batch}`} onNewBatch={nextEdition} newBatchLabel="Another edition" />}
      {cards && (read
        ? <p className={styles.readRow}><span>✓ You read today’s paper.</span> <button type="button" className={styles.retry} onClick={() => markRead(false)}>Undo</button></p>
        : <div className={styles.readRow}><button type="button" className={styles.readBtn} onClick={() => markRead(true)}>Mark as read</button></div>)}
    </div>
  </section>
}
