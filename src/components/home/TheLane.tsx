import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { readAllRows } from '@/lib/readAllRows'
import { loadWordList, type ListWord } from '@/lib/levelTest'
import { laneLights, laneProgress, laneSetId, laneThreshold, wordsForLight, LANE_LEVEL, MAX_NEW_LANE_WORDS } from '@/lib/lane'
import { useSRSStore } from '@/store/srsStore'
import { useAuthStore } from '@/store/authStore'
import { LANE_ITEMS, LANE_CAT, LANE_TRAIN, C, laneBack, laneLabels } from './laneScene'
import styles from './TheLane.module.css'

interface CardLike { id: string; term: string; definition: string }
let cardCache: { user: string; cards: CardLike[] } | null = null

const BACK = laneBack()
const LABELS = laneLabels()
const N = LANE_ITEMS.length
const PROGRESS_SECTIONS = 5
const more = (n: number) => `${n} more word${n === 1 ? '' : 's'}`
const reducedMotion = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false } }

export default function TheLane() {
  const userId = useAuthStore(s => s.user?.id)
  const cardSRS = useSRSStore(s => s.cardSRS)
  const [list, setList] = useState<ListWord[] | null>(null)
  const [cards, setCards] = useState<CardLike[] | null>(cardCache && cardCache.user === userId ? cardCache.cards : null)
  const [failed, setFailed] = useState(false)
  const [shown, setShown] = useState(0)
  const [open, setOpen] = useState<number | null>(null)
  const [explain, setExplain] = useState(false)

  const load = () => {
    setFailed(false)
    loadWordList().then(setList).catch(() => setFailed(true))
    if (!userId) return
    void readAllRows<CardLike>((from, to, signal) => supabase
      .from('cards').select('id, term, definition').order('id').range(from, to).abortSignal(signal))
      .then(({ data, error }) => {
        if (error || !data) { if (!cards) setFailed(true); return }
        cardCache = { user: userId, cards: data }
        setCards(data)
      })
  }
  useEffect(load, [userId])

  const progress = useMemo(() => list && cards ? laneProgress(list, cards, cardSRS, userId ? laneSetId(userId) : undefined) : null, [list, cards, cardSRS, userId])
  const lights = progress ? laneLights(progress, N) : null
  const target = lights?.lit ?? 0

  // Every visit the street comes alive: lights switch on one by one up to your progress
  useEffect(() => {
    if (!lights) return
    if (reducedMotion()) { setShown(target); return }
    setShown(s => Math.min(s, target))
    const step = Math.max(60, Math.min(140, 2600 / Math.max(1, target)))
    let timer: ReturnType<typeof setInterval> | undefined
    const start = setTimeout(() => { timer = setInterval(() => setShown(s => (s >= target ? s : s + 1)), step) }, 350)
    return () => { clearTimeout(start); clearInterval(timer) }
  }, [target, !!lights])

  const ready = !!lights && shown >= target
  const warmth = ready && lights ? lights.warmth : 0
  const next = lights && lights.lit < N ? LANE_ITEMS[lights.lit] : null

  let line: React.ReactNode
  if (failed) line = <>The lane didn’t load. <button type="button" className={styles.inline} onClick={load}>Try again</button></>
  else if (!progress || !lights) line = '天黑了… opening up the lane.'
  else if (!progress.familiar.length && !progress.started) line = `天黑了… Level ${LANE_LEVEL} words you practise on the Taiwan path light up this alley.`
  else if (!next) line = '整條巷子都亮了！The whole lane is lit.'
  else line = <>歡迎回來！{more(lights.toNext)} and {next.name} comes on.</>

  const item = open != null ? LANE_ITEMS[open] : null
  const itemWords = open != null && progress && lights && open < lights.lit ? wordsForLight(progress, open, N) : null

  return <section className={styles.lane} aria-label="The Lane (beta)">
    <h1 className={styles.srOnly}>Home</h1>
    <div className={styles.stage}>
      <svg viewBox="0 0 1600 900" className={styles.svg} role="img" aria-label={lights ? `A street at dusk with ${lights.lit} of ${N} lights on` : 'A street at dusk'}>
        <g dangerouslySetInnerHTML={{ __html: BACK }} />
        <g className={styles.cat} style={{ opacity: shown >= N / 2 ? 1 : 0 }} fill="#f2efe8" stroke={C.ink} strokeWidth="2" dangerouslySetInnerHTML={{ __html: LANE_CAT }} />
        <g>{LANE_ITEMS.map((it, i) => {
          if (!it.pool) return null
          const [cx, cy, rx, ry] = it.pool
          const o = i < shown ? 1 : i === shown ? warmth * 0.35 : 0
          return <ellipse key={i} className={styles.pool} cx={cx} cy={cy} rx={rx} ry={ry} fill={`url(#${it.kind === 'cool' ? 'lanePoolCool' : 'lanePoolWarm'})`} style={{ opacity: o }} />
        })}</g>
        <g>{LANE_ITEMS.map((it, i) => {
          if (it.kind === 'train') return null
          const on = i < shown
          return <g key={i} className={`${styles.item} ${on ? styles.on : ''} ${it.kind === 'cool' ? styles.cool : ''}`} onClick={() => setOpen(i)}>
            <g fill={it.dim} stroke={C.ink} strokeWidth="2" dangerouslySetInnerHTML={{ __html: it.geo }} />
            <g className={styles.lit} fill={it.lit} stroke={C.ink} strokeWidth="2" style={on ? undefined : { opacity: i === shown ? warmth * 0.35 : 0 }} dangerouslySetInnerHTML={{ __html: it.geo }} />
          </g>
        })}</g>
        <g clipPath="url(#laneGap)"><g className={styles.trainWrap} style={{ opacity: LANE_ITEMS.findIndex(it => it.kind === 'train') < shown ? 1 : 0 }}>
          <g className={styles.train} dangerouslySetInnerHTML={{ __html: LANE_TRAIN }} />
        </g></g>
        <g style={{ pointerEvents: 'none' }} dangerouslySetInnerHTML={{ __html: LABELS }} />
      </svg>
      <p className={styles.auntie} aria-live="polite"><b>Auntie</b> · {line}</p>
      {item && <div className={styles.popover} role="dialog" aria-label={item.name}>
        <div className={styles.popHead}><strong>{item.name}</strong><button type="button" onClick={() => setOpen(null)} aria-label="Close">✕</button></div>
        {itemWords
          ? <><p className={styles.popSub}>These words switched it on</p><ul className={styles.words}>{itemWords.map(w => <li key={w.form}><b lang="zh-Hant">{w.form}</b> {w.pinyin} · {w.meaning.replace(/\s*\([^)]*\)/g, '').split(/[;\/]/).map(m => m.trim()).filter(Boolean).slice(0, 2).join('; ')}</li>)}</ul></>
          : <p className={styles.popSub}>Still dark.{progress && open != null ? ` It comes on after ${more(laneThreshold(progress.total, N, open) - progress.familiar.length)}.` : ''}</p>}
      </div>}
    </div>
    <div className={styles.strip}>
      <div className={styles.milestones} role="progressbar" aria-label="Familiar Level 3 words"
        aria-valuemin={0} aria-valuemax={progress?.total || undefined} aria-valuenow={progress?.familiar.length}
        aria-valuetext={progress ? `${progress.familiar.length} of ${progress.total} words familiar` : 'Loading words'}>
        {Array.from({ length: PROGRESS_SECTIONS }, (_, i) => {
          const fraction = progress?.total ? progress.familiar.length / progress.total : 0
          const fill = Math.max(0, Math.min(1, fraction * PROGRESS_SECTIONS - i))
          return <span key={i} aria-hidden="true"><i style={{ width: `${fill * 100}%` }} /></span>
        })}
      </div>
      <div className={styles.stripRow}>
        <span className={styles.count}>{lights && progress ? <><strong>{progress.familiar.length.toLocaleString()}</strong> / {progress.total.toLocaleString()} words familiar</> : 'Counting your words…'}</span>
        <span className={styles.actions}>
          <button type="button" className={styles.inline} onClick={() => setExplain(e => !e)} aria-expanded={explain}>How it lights</button>
          <Link to="/lane/lesson" className={styles.go}>Open daily practice →</Link>
        </span>
      </div>
      {explain && lights && <p className={styles.explain}>Your ten-minute practice starts with due reviews. On lighter days, it introduces up to {MAX_NEW_LANE_WORDS} new words from the TOCFL Level {LANE_LEVEL} list. Matching cards in your sets already count. A word lights the alley once it’s <b>Familiar</b> (right on two different days). About every {lights.per} switch on another light, in order from Auntie’s stall to the far blocks. Words you’ve started but not yet got Familiar warm the next light. Beta: the street and its pace may change.</p>}
    </div>
  </section>
}
