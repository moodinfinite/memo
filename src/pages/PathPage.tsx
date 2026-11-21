import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { useSRSStore } from '@/store/srsStore'
import { useSetsStore } from '@/store/setsStore'
import { levelInfo, levelName, matchMeaning, type ListWord } from '@/lib/levelTest'
import {
  pathCard, pathSetTitle, sectionPlace, tagFor, taggedLevels, testOutPassed, testOutSample, testOutTarget, wordState,
  KNOWN_INTERVAL, STAGE_PART, TEST_OUT, PATH_KEY, SECTIONS, THEMES, UNIT_SIZE, type CardRef, type PathUnit, type TestOutScope, type UnitStage, type WordState,
} from '@/lib/path'
import { usePath } from '@/lib/usePath'
import styles from './PathPage.module.css'

const LaneReveal = lazy(() => import('@/components/home/LaneReveal'))

const STEPS = ['Sort', 'Learn', 'Check'] as const
/** The unit's badge, topic and where you are in its three steps */
function UnitHeader({ unit, units, step }: { unit: PathUnit; units: PathUnit[]; step: 0 | 1 | 2 }) {
  const t = theme(unit.theme)
  const { n, of } = sectionPlace(units, unit)
  return (
    <header className={styles.unitHeader}>
      <span className={styles.unitBadge} aria-hidden="true">{n}</span>
      <div className={styles.unitHeadText}>
        <span className={styles.unitKicker}>{SECTIONS[unit.section]} · Unit {n} of {of}</span>
        <span className={styles.unitTopic}>{t.en} <span className={styles.unitTopicZh} lang="zh-Hant">{t.zh}</span></span>
      </div>
      <ol className={styles.steps} aria-label="Unit steps">
        {STEPS.map((name, i) => (
          <li key={name} className={i < step ? styles.stepDone : i === step ? styles.stepNow : undefined} aria-current={i === step ? 'step' : undefined}>
            <span aria-hidden="true">{i < step ? '✓' : i + 1}</span>{name}
          </li>
        ))}
      </ol>
    </header>
  )
}

const shortMeaning = (m: string) => m.replace(/\s*\([^)]*\)/g, '').split(/[;/]/).map(s => s.trim()).filter(Boolean).slice(0, 3).join('; ')
const theme = (t: string) => THEMES[t] ?? THEMES.general
/** Locked units shown after the current one */
const AHEAD = 8
/** How long a right answer stays up (pinyin and example) before the check moves on */
const AUTO_NEXT_MS = 1600

interface CheckItem { word: ListWord; card?: CardRef; score: number | null; typed: string }
/** A test-out run: passing marks units up to `target` done */
interface TestOut { scope: TestOutScope; target: number; skipped: number }
type Phase = { kind: 'path' } | { kind: 'sweep'; unit: PathUnit } | { kind: 'check'; unit: PathUnit; items: CheckItem[]; at: number; revealed: boolean; test?: TestOut }
  | { kind: 'done'; unit: PathUnit; items: CheckItem[]; test?: TestOut & { passed: boolean }; before?: { done: number; part: number } }

export default function PathPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { user, list, tags, cards, pathSets, index, failed, reload: load, setCards, setPathSets, setFailed, progress, latest, start, levels, onLevel, seen } = usePath()
  const [phase, setPhase] = useState<Phase>({ kind: 'path' })
  const [choices, setChoices] = useState<Record<string, 'know' | 'learn'>>({})
  const [busy, setBusy] = useState(false)
  const [typed, setTyped] = useState('')
  const [viewLevel, setViewLevel] = useState<number | null>(null)
  const [showDone, setShowDone] = useState(false)

  const active = levels.find(l => l.level === viewLevel) ?? onLevel

  const saveProgress = async (next: typeof progress) => {
    const { data, error } = await supabase.auth.updateUser({ data: { [PATH_KEY]: next } })
    if (error || !data.user) throw new Error('Could not save your progress')
    useAuthStore.setState({ user: data.user })
  }

  /** Where a level stands now, so the done screen can play the alley from here to after the save */
  const standing = (level: number) => {
    const l = levels.find(x => x.level === level)
    return l ? { done: l.doneCount, part: l.complete ? 0 : STAGE_PART[l.stages[l.current]] } : undefined
  }

  const chooseStart = (level: number) => { void saveProgress({ ...progress, start: level }).catch(err => setFailed(err.message)) }

  // ── Sweep: mark each new word "know it" or "learn it", then add them all to the level's path set ──
  const finishSweep = async (unit: PathUnit) => {
    if (!user || !index || !cards || !pathSets) return
    const fresh = unit.words.filter(w => wordState(w, index, seen).state === 'new')
    setBusy(true)
    try {
      const title = pathSetTitle(unit.level)
      let setId = pathSets.find(s => s.title === title)?.id
      if (!setId) {
        const { data, error } = await supabase.from('sets').insert({
          title, description: `Your learning path: TOCFL ${levelName(unit.level)} words, ${UNIT_SIZE} at a time.`, user_id: user.id, folder_id: null, pinned: false,
        }).select('id, title').single()
        if (error || !data) throw new Error('Could not create your path set')
        setId = data.id as string
        setPathSets(prev => [...(prev ?? []), { id: setId!, title }])
      }
      const position = cards.filter(c => c.set_id === setId).length
      const rows = fresh.map((w, i) => ({ id: crypto.randomUUID(), set_id: setId!, user_id: user.id, position: position + i, ...pathCard(w, tagFor(tags!, w)) }))
      if (rows.length) {
        const { error } = await supabase.from('cards').insert(rows)
        if (error) throw new Error('Could not add the words')
      }
      const pick = (w: ListWord) => choices[w.forms[0]] ?? 'learn'
      for (const [i, w] of fresh.entries()) if (pick(w) === 'know') useSRSStore.getState().seedKnown(rows[i].id, setId!, KNOWN_INTERVAL)
      setCards(prev => [...(prev ?? []), ...rows.map(({ id, set_id, term, definition }) => ({ id, set_id, term, definition }))])
      useSetsStore.setState({ setsLastFetched: 0 })
      setChoices({})
      // 1. One flow: learn the new words (which comes back to the check), or straight to the check
      if (fresh.some(w => pick(w) === 'learn')) navigate(`/sets/${setId}/study?mode=learn&filter=new&from=path`)
      else {
        const added = new Map(rows.map(r => [r.term, { id: r.id, set_id: r.set_id, term: r.term, definition: r.definition }]))
        startCheck(unit, w => added.get(w.forms[0]))
      }
    } catch (err: any) {
      setFailed(err?.message ?? 'Something went wrong')
    } finally { setBusy(false) }
  }

  /** `extra` finds cards added a moment ago, before the index has caught up */
  const startCheck = (unit: PathUnit, extra?: (w: ListWord) => CardRef | undefined) => {
    if (!index) return
    const items = unit.words.flatMap(word => {
      const card = wordState(word, index, seen).card ?? extra?.(word)
      return card ? [{ word, card, score: null, typed: '' }] : []
    })
    setTyped('')
    setPhase({ kind: 'check', unit, items, at: 0, revealed: false })
  }

  const go = (unit: PathUnit, stage: UnitStage) => {
    if (stage === 'sweep') { setChoices({}); setPhase({ kind: 'sweep', unit }) }
    else if (stage === 'learn') {
      const setId = pathSets?.find(s => s.title === pathSetTitle(unit.level))?.id
      if (setId) navigate(`/sets/${setId}/study?mode=learn&filter=new&from=path`)
    } else startCheck(unit)
  }

  // Opened from Home's "continue" button: go straight to the current unit's next step
  const jumped = useRef(false)
  useEffect(() => {
    const want = params.get('go')
    if (jumped.current || (want !== '1' && want !== 'check') || !onLevel || !pathSets) return
    jumped.current = true
    setParams({}, { replace: true })
    const unit = onLevel.units[onLevel.current]
    const stage = onLevel.stages[onLevel.current]
    // Back from a Learn session only goes on to the check, so an unfinished session can't loop
    if (unit && stage !== 'skip' && (want === '1' || stage === 'check')) go(unit, stage)
  }, [onLevel, pathSets])

  const startTestOut = (unit: PathUnit, scope: TestOutScope) => {
    const lv = levels.find(l => l.level === unit.level)
    if (!lv) return
    const target = testOutTarget(lv.units, unit.index, scope)
    const words = testOutSample(lv.units, lv.states, unit.index, target, TEST_OUT[scope])
    if (!words.length) return
    setTyped('')
    setPhase({ kind: 'check', unit, items: words.map(word => ({ word, score: null, typed: '' })), at: 0, revealed: false, test: { scope, target, skipped: target - unit.index } })
  }

  const finishTestOut = async (unit: PathUnit, items: CheckItem[], test: TestOut) => {
    const passed = testOutPassed(items.filter(i => i.score === 1).length, items.length)
    const before = standing(unit.level)
    setBusy(true)
    try {
      if (passed) await saveProgress({ ...progress, done: { ...progress.done, [unit.level]: Math.max(progress.done[unit.level] ?? 0, test.target) } })
      setPhase({ kind: 'done', unit, items, test: { ...test, passed }, before })
    } catch (err: any) {
      setFailed(err?.message ?? 'Something went wrong')
    } finally { setBusy(false) }
  }

  const finishCheck = async (unit: PathUnit, items: CheckItem[]) => {
    const before = standing(unit.level)
    setBusy(true)
    try {
      for (const it of items) if (it.card) void useSRSStore.getState().updateSRS(it.card.id, it.card.set_id, it.score === 1)
      await saveProgress({ ...progress, done: { ...progress.done, [unit.level]: Math.max(progress.done[unit.level] ?? 0, unit.index + 1) } })
      setPhase({ kind: 'done', unit, items, before })
    } catch (err: any) {
      setFailed(err?.message ?? 'Something went wrong')
    } finally { setBusy(false) }
  }

  // ── Check: a right answer moves on by itself; a miss waits for Next (or Enter) so you can read it ──
  const advanceCheck = (p: Extract<Phase, { kind: 'check' }>) => {
    if (p.at + 1 < p.items.length) { setTyped(''); setPhase({ ...p, at: p.at + 1, revealed: false }) }
    else if (p.test) void finishTestOut(p.unit, p.items, p.test)
    else void finishCheck(p.unit, p.items)
  }
  const settleCheck = (p: Extract<Phase, { kind: 'check' }>, score: number) =>
    advanceCheck({ ...p, items: p.items.map((x, i) => i === p.at ? { ...x, score } : x) })
  useEffect(() => {
    if (phase.kind !== 'check' || !phase.revealed) return
    const score = phase.items[phase.at].score
    if (score === 1) { const id = setTimeout(() => advanceCheck(phase), AUTO_NEXT_MS); return () => clearTimeout(id) }
    if (score !== null) return
    // Were you right? Y or N
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const k = e.key.toLowerCase()
      if (k === 'y' || k === 'n') { e.preventDefault(); settleCheck(phase, k === 'y' ? 1 : 0) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase])

  // Each screen starts at the top (the page scrolls inside the layout's main column)
  useEffect(() => { document.querySelector('main')?.scrollTo({ top: 0 }) }, [phase.kind])
  /** Focus a button without scrolling to it, so the done screen opens on the alley */
  const focusQuietly = (el: HTMLButtonElement | null) => { if (el && document.activeElement !== el) el.focus({ preventScroll: true }) }

  // ── Screens ──

  if (failed) return (
    <div className={styles.center}>
      <span>{failed}</span>
      <button className={styles.primaryBtn} onClick={() => { setPhase({ kind: 'path' }); load() }}>Try again</button>
    </div>
  )
  if (!list || !tags || !cards || !index) return <div className={styles.center}><span>Loading your path…</span></div>

  if (start === null) return (
    <div className={styles.page}>
      <div className={styles.eyebrow}>Your path</div>
      <h1 className={styles.title}>Where should your path start?</h1>
      <p className={styles.lede}>The path walks the official TOCFL words for your level, six at a time, most useful first. Take the level check to start at your level, or pick one.</p>
      <div className={styles.row}>
        <Link to="/level" className={styles.primaryBtn}>Take the level check</Link>
        {taggedLevels(tags).map(l => <button key={l} className={styles.ghostBtn} onClick={() => chooseStart(l)}>Start at {levelName(l)}</button>)}
      </div>
    </div>
  )

  if (phase.kind === 'sweep') {
    const { unit } = phase
    const rows = unit.words.map(w => ({ w, state: wordState(w, index, seen).state }))
    const fresh = rows.filter(r => r.state === 'new')
    const own = rows.filter(r => r.state === 'own')
    const pickOf = (w: ListWord) => choices[w.forms[0]] ?? 'learn'
    const toLearn = fresh.filter(r => pickOf(r.w) === 'learn').length
    const allKnown = fresh.length > 0 && toLearn === 0
    return (
      <div className={styles.page}>
        <UnitHeader unit={unit} units={levels.find(l => l.level === unit.level)?.units ?? [unit]} step={0} />
        {(() => {
          const lv = levels.find(l => l.level === unit.level)
          if (!lv) return null
          const sectionEnd = testOutTarget(lv.units, unit.index, 'section')
          return (
            <div className={styles.testOutBar}>
              <span>Know these already?</span>
              {sectionEnd < lv.units.length && <button className={styles.testOutBtn} onClick={() => startTestOut(unit, 'section')}>
                Test out of {SECTIONS[unit.section].toLowerCase()} <small>{sectionEnd - unit.index} units</small></button>}
              <button className={styles.testOutBtn} onClick={() => startTestOut(unit, 'level')}>
                Test out of {levelName(unit.level)} <small>{lv.units.length - unit.index} units</small></button>
            </div>
          )
        })()}
        <h1 className={styles.title}>Tap the ones you already know</h1>
        <div className={styles.sweepList}>
          {fresh.map(({ w }) => {
            const tag = tagFor(tags, w)
            const pick = pickOf(w)
            return (
              <div key={w.forms[0]} className={styles.sweepRow}>
                <div className={styles.sweepWord}>
                  <span className={styles.sweepZh} lang="zh-Hant">{w.forms[0]}</span>
                  <span className={styles.sweepPinyin}>{w.pinyin}</span>
                  <span className={styles.sweepMeaning}>{shortMeaning(w.meaning) || tag?.english}</span>
                  {tag?.example && <span className={styles.example}><span lang="zh-Hant">{tag.example}</span> <span className={styles.exampleEn}>{tag.english}</span></span>}
                </div>
                <div className={styles.pickRow} role="group" aria-label={`${w.forms[0]}: know it or learn it`}>
                  {(['know', 'learn'] as const).map(c => (
                    <button key={c} type="button" aria-pressed={pick === c} className={[styles.pick, pick === c ? (c === 'know' ? styles.pickKnow : styles.pickLearn) : ''].join(' ')}
                      onClick={() => setChoices(prev => ({ ...prev, [w.forms[0]]: c }))}>{c === 'know' ? 'Know it' : 'Learn it'}</button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
        {own.length > 0 && <p className={styles.footnote}>Already in your sets: <span lang="zh-Hant">{own.map(r => r.w.forms[0]).join('、')}</span></p>}
        <div className={styles.row}>
          <button className={styles.primaryBtn} disabled={busy} onClick={() => finishSweep(unit)}>
            {busy ? 'Adding…' : toLearn ? `Learn ${toLearn} word${toLearn === 1 ? '' : 's'} →` : 'Go to the check →'}
          </button>
          {fresh.length > 1 && <button className={styles.linkBtn} onClick={() => setChoices(Object.fromEntries(fresh.map(r => [r.w.forms[0], allKnown ? 'learn' : 'know'])))}>
            {allKnown ? 'Clear' : 'I know all of these'}
          </button>}
          <button className={styles.ghostBtn} onClick={() => setPhase({ kind: 'path' })}>Back</button>
        </div>
      </div>
    )
  }

  if (phase.kind === 'check') {
    const { unit, items, at, revealed } = phase
    const it = items[at]
    const answer = (score: number | null) => {
      const next = items.map((x, i) => i === at ? { ...x, score, typed } : x)
      setPhase({ ...phase, items: next, revealed: true })
    }
    const settle = (score: number) => settleCheck(phase, score)
    const nextItem = () => advanceCheck(phase)
    const tag = tagFor(tags, it.word)
    return (
      <div className={styles.page}>
        {!phase.test && <UnitHeader unit={unit} units={levels.find(l => l.level === unit.level)?.units ?? [unit]} step={2} />}
        <div className={styles.progressRow}>
          <span className={styles.eyebrow}>{phase.test ? `Test out · ${phase.test.scope === 'level' ? `rest of ${levelName(unit.level)}` : SECTIONS[unit.section]}` : ''}</span>
          <span className={styles.count}>{at + 1} of {items.length}</span>
        </div>
        <div className={styles.card}>
          <div className={styles.checkWord} lang="zh-Hant">{it.word.forms[0]}</div>
          {!revealed ? (
            <form className={styles.checkForm} onSubmit={e => { e.preventDefault(); if (typed.trim()) answer(matchMeaning(typed, it.word.meaning)) }}>
              <label className={styles.label} htmlFor="path-meaning">What does it mean in English?</label>
              <input id="path-meaning" className={styles.input} value={typed} onChange={e => setTyped(e.target.value)} autoFocus autoComplete="off"
                autoCapitalize="off" spellCheck={false} maxLength={100} placeholder="Type a meaning" />
              <div className={styles.row}>
                <button type="submit" className={styles.primaryBtn} disabled={!typed.trim()}>Check</button>
                <button type="button" className={styles.ghostBtn} onClick={() => answer(0)}>Don’t know</button>
              </div>
            </form>
          ) : (
            <div className={styles.reveal}>
              <span className={styles.revealPinyin}>{it.word.pinyin}</span>
              <span>{shortMeaning(it.word.meaning) || tag?.english}</span>
              {tag?.example && <span className={styles.example}><span lang="zh-Hant">{tag.example}</span> <span className={styles.exampleEn}>{tag.english}</span></span>}
              {it.score === null ? (
                <div className={styles.selfGrade}>
                  <span>You wrote “{it.typed}”. Were you right?</span>
                  <div className={styles.row}>
                    <button className={styles.ghostBtn} onClick={() => settle(1)} disabled={busy}>Yes <kbd className={styles.key}>Y</kbd></button>
                    <button className={styles.ghostBtn} onClick={() => settle(0)} disabled={busy}>No <kbd className={styles.key}>N</kbd></button>
                  </div>
                </div>
              ) : <span className={it.score === 1 ? styles.right : styles.wrong}>{it.score === 1 ? 'Yes!' : it.typed ? 'Not quite.' : 'Noted.'}</span>}
            </div>
          )}
        </div>
        {revealed && it.score !== null && (it.score === 1
          ? <div className={styles.autoNext} key={at} aria-hidden="true"><i style={{ animationDuration: `${AUTO_NEXT_MS}ms` }} /></div>
          : <button className={styles.primaryBtn} onClick={nextItem} disabled={busy} autoFocus>{at + 1 < items.length ? 'Next' : busy ? 'Saving…' : phase.test ? 'See result' : 'Finish unit'}</button>)}
        {busy && it.score === 1 && <span className={styles.count}>Saving…</span>}
      </div>
    )
  }

  if (phase.kind === 'done') {
    const { unit, items, test, before } = phase
    const missed = items.filter(i => i.score !== 1)
    const need = Math.ceil(items.length * TEST_OUT.pass)
    const level = levels.find(l => l.level === unit.level)
    const nextUnit = onLevel && !onLevel.complete ? onLevel.units[onLevel.current] : null
    const nextStage = nextUnit && onLevel ? onLevel.stages[onLevel.current] : null
    return (
      <div className={`${styles.page} ${styles.pageWide}`}>
        {level && before && <Suspense fallback={<div className={styles.lanePlaceholder} />}><LaneReveal level={level} before={before} /></Suspense>}
        <div className={styles.eyebrow}>{test ? (test.passed ? 'Tested out' : 'Test out') : `${SECTIONS[unit.section]} · Unit ${sectionPlace(levels.find(l => l.level === unit.level)?.units ?? [unit], unit).n} done`}</div>
        <h1 className={styles.title}>{items.length - missed.length} of {items.length} right</h1>
        {test && <p className={styles.lede}>{test.passed
          ? `You skipped ${test.skipped} unit${test.skipped === 1 ? '' : 's'}${test.scope === 'level' ? ` and finished ${levelName(unit.level)}` : ''}. Skipped words aren’t added to your sets.`
          : `Skipping needs ${need} of ${items.length}. Keep going unit by unit: the sort step lets you mark words you know in a tap.`}</p>}
        {missed.length ? <>
          <p className={styles.lede}>{test ? 'Words you missed:' : 'These come back in your reviews tomorrow.'}</p>
          <div className={styles.missedList}>
            {missed.map(({ word }) => {
              const tag = tagFor(tags, word)
              return <div key={word.forms[0]} className={styles.missed}>
                <span className={styles.missedZh} lang="zh-Hant">{word.forms[0]}</span>
                <span><b>{word.pinyin}</b> · {shortMeaning(word.meaning) || tag?.english}{tag?.example && <><br /><span lang="zh-Hant">{tag.example}</span> <span className={styles.exampleEn}>{tag.english}</span></>}</span>
              </div>
            })}
          </div>
        </> : test ? null : <p className={styles.lede}>All of them. Words you said you knew come back in a review in two weeks to make sure they stick.</p>}
        <div className={styles.row}>
          {nextUnit && nextStage && nextStage !== 'skip'
            ? <button className={styles.primaryBtn} onClick={() => go(nextUnit, nextStage)} ref={focusQuietly}>Next unit →</button>
            : <button className={styles.primaryBtn} onClick={() => setPhase({ kind: 'path' })} ref={focusQuietly}>Back to the path</button>}
          <Link to="/" className={styles.ghostBtn}>Home</Link>
        </div>
      </div>
    )
  }

  // ── The path ──
  if (!active) return (
    <div className={styles.page}>
      <div className={styles.eyebrow}>Your path</div>
      <h1 className={styles.title}>The {levelName(start)} path isn’t ready yet</h1>
      <p className={styles.lede}>Paths exist for {taggedLevels(tags).map(levelName).join(' and ')} so far.</p>
      <div className={styles.row}>{taggedLevels(tags).map(l => <button key={l} className={styles.ghostBtn} onClick={() => chooseStart(l)}>Start at {levelName(l)}</button>)}</div>
    </div>
  )

  const { level, units, states, stages, current, complete } = active
  const doneCount = complete ? units.length : current
  const from = showDone ? 0 : Math.max(0, doneCount - 2)
  const shown = units.slice(from, complete ? units.length : current + 1 + AHEAD)
  const later = complete ? 0 : Math.max(0, units.length - (current + 1 + AHEAD))

  return (
    <div className={styles.page}>
      <div className={styles.eyebrow}>Your path</div>
      <h1 className={styles.title}>{levelName(level)} <span lang="zh-Hant" className={styles.titleZh}>{levelInfo(level).zh}</span></h1>
      <div className={styles.levelTabs} role="tablist" aria-label="Path levels">
        {levels.map(l => (
          <button key={l.level} role="tab" aria-selected={l.level === level} className={[styles.levelTab, l.level === level ? styles.levelTabOn : ''].join(' ')}
            onClick={() => { setViewLevel(l.level); setShowDone(false) }}>
            {levelName(l.level)}{l.complete ? ' ✓' : ''}
          </button>
        ))}
      </div>
      <div className={styles.meter}>
        <div className={styles.meterBar}><div style={{ width: `${(doneCount / units.length) * 100}%` }} /></div>
        <span className={styles.count}><b>{doneCount}</b> of {units.length} units · {active.covered} of {active.words} words in your sets</span>
      </div>

      <ol className={styles.line}>
        {from > 0 && <li className={styles.collapsed}><button className={styles.linkBtn} onClick={() => setShowDone(true)}>Show {from} earlier unit{from === 1 ? '' : 's'}</button></li>}
        {shown.map((unit, k) => {
          const i = unit.index
          const prev = k > 0 ? shown[k - 1] : i > 0 ? units[i - 1] : null
          const stage = stages[i]
          const state = complete || i < current ? 'done' : i === current ? 'current' : 'locked'
          return (
            <li key={i} className={styles.unitItem}>
              {(!prev || prev.section !== unit.section) && (() => {
                const inSection = units.filter(u => u.section === unit.section)
                const doneIn = inSection.filter(u => u.index < doneCount).length
                return <div className={styles.section}>
                  <span className={styles.sectionName}>{SECTIONS[unit.section]}</span>
                  <span className={styles.sectionCount}>{doneIn} of {inSection.length} units</span>
                  <span className={styles.sectionBar} aria-hidden="true"><i style={{ width: `${(doneIn / inSection.length) * 100}%` }} /></span>
                </div>
              })()}
              <div className={[styles.unit, styles[state]].join(' ')} aria-current={state === 'current' ? 'step' : undefined}>
                <span className={styles.node} aria-hidden="true">{state === 'done' ? '✓' : sectionPlace(units, unit).n}</span>
                <div className={styles.unitBody}>
                  <div className={styles.unitHead}>
                    <span className={styles.unitTheme}>{theme(unit.theme).en}</span>
                    <span className={styles.unitZh} lang="zh-Hant">{theme(unit.theme).zh}</span>
                    {stage === 'skip' && state === 'done' && <span className={styles.tag}>In your sets</span>}
                  </div>
                  <div className={styles.unitWords} lang="zh-Hant">
                    {unit.words.map((w, j) => <span key={w.forms[0]} className={stateClass(states[i][j])}>{w.forms[0]}</span>)}
                  </div>
                  {state === 'current' && stage !== 'skip' && (
                    <div className={styles.unitAction}>
                      <button className={styles.primaryBtn} onClick={() => go(unit, stage)}>
                        {stage === 'sweep' ? 'Start unit' : stage === 'learn' ? `Learn ${states[i].filter(s => s === 'added').length} words` : 'Unit check'}
                      </button>
                      <span className={styles.stepHint}>{stage === 'sweep' ? 'Step 1 of 3 · sort the words' : stage === 'learn' ? 'Step 2 of 3 · Learn mode' : 'Step 3 of 3 · type each meaning'}</span>
                    </div>
                  )}
                </div>
              </div>
            </li>
          )
        })}
        {later > 0 && <li className={styles.collapsed}>{later} more unit{later === 1 ? '' : 's'} in {levelName(level)}</li>}
      </ol>
      {complete && <p className={styles.lede}>{levelName(level)} is done. {levels.find(l => l.level > level) ? 'The next level is open above.' : 'More levels are coming.'}</p>}
      <p className={styles.footnote}>Words come from the official TOCFL list. Topics, usefulness and example sentences were written once by Claude and saved, so they may occasionally be off. Path words go into the set “{pathSetTitle(level)}”, so they show up in Daily 10 reviews too.
        {latest && progress.start === undefined ? ` Starting from your level check (${levelName(latest.level)}).` : ''}</p>
    </div>
  )

  function stateClass(s: WordState) { return s === 'new' ? '' : s === 'own' ? styles.wOwn : styles.wAdded }
}
