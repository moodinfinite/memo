import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { useSRSStore } from '@/store/srsStore'
import { useSetsStore } from '@/store/setsStore'
import { levelInfo, levelName, matchMeaning, type ListWord } from '@/lib/levelTest'
import {
  pathCard, pathSetTitle, tagFor, taggedLevels, testOutPassed, testOutSample, testOutTarget, wordState,
  KNOWN_INTERVAL, TEST_OUT, PATH_KEY, SECTIONS, THEMES, UNIT_SIZE, type CardRef, type PathUnit, type TestOutScope, type UnitStage, type WordState,
} from '@/lib/path'
import { usePath } from '@/lib/usePath'
import styles from './PathPage.module.css'

const shortMeaning = (m: string) => m.replace(/\s*\([^)]*\)/g, '').split(/[;/]/).map(s => s.trim()).filter(Boolean).slice(0, 3).join('; ')
const theme = (t: string) => THEMES[t] ?? THEMES.general
/** Locked units shown after the current one */
const AHEAD = 8

interface CheckItem { word: ListWord; card?: CardRef; score: number | null; typed: string }
/** A test-out run: passing marks units up to `target` done */
interface TestOut { scope: TestOutScope; target: number; skipped: number }
type Phase = { kind: 'path' } | { kind: 'sweep'; unit: PathUnit } | { kind: 'check'; unit: PathUnit; items: CheckItem[]; at: number; revealed: boolean; test?: TestOut }
  | { kind: 'done'; unit: PathUnit; items: CheckItem[]; test?: TestOut & { passed: boolean } }

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
      for (const [i, w] of fresh.entries()) if (choices[w.forms[0]] === 'know') useSRSStore.getState().seedKnown(rows[i].id, setId!, KNOWN_INTERVAL)
      setCards(prev => [...(prev ?? []), ...rows.map(({ id, set_id, term, definition }) => ({ id, set_id, term, definition }))])
      useSetsStore.setState({ setsLastFetched: 0 })
      setChoices({})
      if (fresh.some(w => choices[w.forms[0]] === 'learn')) navigate(`/sets/${setId}/study?mode=learn&filter=new&from=path`)
      else setPhase({ kind: 'path' })
    } catch (err: any) {
      setFailed(err?.message ?? 'Something went wrong')
    } finally { setBusy(false) }
  }

  const startCheck = (unit: PathUnit) => {
    if (!index) return
    const items = unit.words.flatMap(word => {
      const { card } = wordState(word, index, seen)
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
    if (jumped.current || params.get('go') !== '1' || !onLevel || !pathSets) return
    jumped.current = true
    setParams({}, { replace: true })
    const unit = onLevel.units[onLevel.current]
    const stage = onLevel.stages[onLevel.current]
    if (unit && stage !== 'skip') go(unit, stage)
  }, [onLevel, pathSets])

  const startTestOut = (unit: PathUnit, scope: TestOutScope) => {
    if (!active) return
    const target = testOutTarget(active.units, unit.index, scope)
    const words = testOutSample(active.units, active.states, unit.index, target, TEST_OUT[scope])
    if (!words.length) return
    setTyped('')
    setPhase({ kind: 'check', unit, items: words.map(word => ({ word, score: null, typed: '' })), at: 0, revealed: false, test: { scope, target, skipped: target - unit.index } })
  }

  const finishTestOut = async (unit: PathUnit, items: CheckItem[], test: TestOut) => {
    const passed = testOutPassed(items.filter(i => i.score === 1).length, items.length)
    setBusy(true)
    try {
      if (passed) await saveProgress({ ...progress, done: { ...progress.done, [unit.level]: Math.max(progress.done[unit.level] ?? 0, test.target) } })
      setPhase({ kind: 'done', unit, items, test: { ...test, passed } })
    } catch (err: any) {
      setFailed(err?.message ?? 'Something went wrong')
    } finally { setBusy(false) }
  }

  const finishCheck = async (unit: PathUnit, items: CheckItem[]) => {
    setBusy(true)
    try {
      for (const it of items) if (it.card) void useSRSStore.getState().updateSRS(it.card.id, it.card.set_id, it.score === 1)
      await saveProgress({ ...progress, done: { ...progress.done, [unit.level]: Math.max(progress.done[unit.level] ?? 0, unit.index + 1) } })
      setPhase({ kind: 'done', unit, items })
    } catch (err: any) {
      setFailed(err?.message ?? 'Something went wrong')
    } finally { setBusy(false) }
  }

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
    const ready = fresh.every(r => choices[r.w.forms[0]])
    return (
      <div className={styles.page}>
        <div className={styles.eyebrow}>Unit {unit.index + 1} · {theme(unit.theme).en}</div>
        <h1 className={styles.title}>Which of these do you know?</h1>
        <p className={styles.lede}>Words you know are skipped for now and tested at the end of the unit. The rest you’ll learn next.</p>
        <div className={styles.sweepList}>
          {fresh.map(({ w }) => {
            const tag = tagFor(tags, w)
            const pick = choices[w.forms[0]]
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
          <button className={styles.primaryBtn} disabled={!ready || busy} onClick={() => finishSweep(unit)}>
            {busy ? 'Adding…' : fresh.some(r => choices[r.w.forms[0]] === 'learn') ? 'Add and learn' : 'Add and continue'}
          </button>
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
    const settle = (score: number) => setPhase({ ...phase, items: items.map((x, i) => i === at ? { ...x, score } : x) })
    const nextItem = () => {
      if (at + 1 < items.length) { setTyped(''); setPhase({ ...phase, at: at + 1, revealed: false }) }
      else if (phase.test) void finishTestOut(unit, items, phase.test)
      else void finishCheck(unit, items)
    }
    const tag = tagFor(tags, it.word)
    return (
      <div className={styles.page}>
        <div className={styles.progressRow}>
          <span className={styles.eyebrow}>{phase.test ? `Test out · ${phase.test.scope === 'level' ? `rest of ${levelName(unit.level)}` : SECTIONS[unit.section]}` : `Unit ${unit.index + 1} check`}</span>
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
                    <button className={styles.ghostBtn} onClick={() => settle(1)}>Yes</button>
                    <button className={styles.ghostBtn} onClick={() => settle(0)}>No</button>
                  </div>
                </div>
              ) : <span className={it.score === 1 ? styles.right : styles.wrong}>{it.score === 1 ? 'Yes.' : it.typed ? 'Not quite.' : 'Noted.'}</span>}
            </div>
          )}
        </div>
        {revealed && it.score !== null && <button className={styles.primaryBtn} onClick={nextItem} disabled={busy} autoFocus>{at + 1 < items.length ? 'Next' : busy ? 'Saving…' : phase.test ? 'See result' : 'Finish unit'}</button>}
      </div>
    )
  }

  if (phase.kind === 'done') {
    const { unit, items, test } = phase
    const missed = items.filter(i => i.score !== 1)
    const need = Math.ceil(items.length * TEST_OUT.pass)
    return (
      <div className={styles.page}>
        <div className={styles.eyebrow}>{test ? (test.passed ? 'Tested out' : 'Test out') : `Unit ${unit.index + 1} done`}</div>
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
        <div className={styles.row}><button className={styles.primaryBtn} onClick={() => setPhase({ kind: 'path' })} autoFocus>Back to the path</button></div>
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
              {(!prev || prev.section !== unit.section) && <div className={styles.section}>{SECTIONS[unit.section]}</div>}
              <div className={[styles.unit, styles[state]].join(' ')} aria-current={state === 'current' ? 'step' : undefined}>
                <span className={styles.node} aria-hidden="true">{state === 'done' ? '✓' : i + 1}</span>
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
                  {state === 'current' && stage !== 'skip' && (() => {
                    const sectionEnd = testOutTarget(units, i, 'section')
                    return (
                      <div className={styles.testOut}>
                        Already know this?{' '}
                        {sectionEnd < units.length && <><button className={styles.linkBtn} onClick={() => startTestOut(unit, 'section')}>Test out of {SECTIONS[unit.section].toLowerCase()}</button> ({sectionEnd - i} units) · </>}
                        <button className={styles.linkBtn} onClick={() => startTestOut(unit, 'level')}>Test out of {levelName(level)}</button> ({units.length - i} units)
                      </div>
                    )
                  })()}
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
