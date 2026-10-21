import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { chineseLang } from '@/lib/cjk'
import {
  LEVELS_KEY, MAX_STAGES, SKILLS, buildResult, estimateLevel, isLevelCheckDue, isParagraphTask, levelHistory,
  nextStageLevel, startLevel, withResult, writingTask, type LevelItem, type LevelResult, type Stage,
} from '@/lib/levelTest'
import SpeakButton from '@/components/ui/SpeakButton'
import styles from './LevelPage.module.css'

type Phase = 'intro' | 'loading' | 'question' | 'writing' | 'grading' | 'results' | 'error'
const ITEMS_PER_STAGE = 5

async function callLevelAPI<T>(body: Record<string, unknown>, signal: AbortSignal): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch('/api/level-test', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${session?.access_token ?? ''}` },
    body: JSON.stringify(body),
    signal,
  })
  let data: any
  try { data = JSON.parse(await res.text()) } catch { throw new Error('The server took too long. Try again.') }
  if (!res.ok) throw new Error(data?.error || 'Something went wrong')
  return data as T
}

export default function LevelPage() {
  const user = useAuthStore(s => s.user)
  const history = levelHistory(user?.user_metadata)
  const [phase, setPhase] = useState<Phase>('intro')
  const [loadingText, setLoadingText] = useState('')
  const [error, setError] = useState<{ message: string; retry: () => void } | null>(null)
  const [stages, setStages] = useState<Stage[]>([])
  const [itemIdx, setItemIdx] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const [writing, setWriting] = useState('')
  const [grade, setGrade] = useState<{ level: number; feedback: string; corrected: string } | null>(null)
  const [result, setResult] = useState<LevelResult | null>(null)
  const [saveState, setSaveState] = useState<'saving' | 'saved' | 'failed'>('saving')
  const controller = useRef<AbortController | null>(null)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort() } }, [])

  const request = <T,>(body: Record<string, unknown>) => {
    controller.current?.abort()
    const c = new AbortController()
    controller.current = c
    const deadline = setTimeout(() => c.abort(), 50_000)
    return callLevelAPI<T>(body, c.signal).finally(() => clearTimeout(deadline))
  }
  const fail = (err: any, retry: () => void) => {
    if (!mounted.current) return
    setError({ message: err?.name === 'AbortError' ? 'That took too long. Try again.' : err?.message ?? 'Something went wrong', retry })
    setPhase('error')
  }

  /** Write a stage, then have Claude answer it blind and keep only the items it agrees with */
  const loadStage = async (level: number, done: Stage[]) => {
    setPhase('loading')
    setError(null)
    const avoid = done.flatMap(s => s.items.map(i => i.question))
    try {
      let items: LevelItem[] = []
      for (let attempt = 0; attempt < 2 && items.length < 3; attempt++) {
        setLoadingText(`Writing HSK ${level} questions…`)
        const generated = await request<{ items: LevelItem[] }>({ action: 'generate', level, avoid: [...avoid, ...items.map(i => i.question)] })
        setLoadingText('Double-checking the answers…')
        const checked = await request<{ items: LevelItem[] }>({ action: 'verify', level, items: generated.items })
        items = [...items, ...checked.items].slice(0, ITEMS_PER_STAGE)
      }
      if (!items.length) throw new Error('Could not write reliable questions this time. Try again.')
      setStages([...done, { level, items, answers: [] }])
      setItemIdx(0)
      setPicked(null)
      setPhase('question')
    } catch (err) { fail(err, () => loadStage(level, done)) }
  }

  const begin = () => { setStages([]); setWriting(''); setGrade(null); setResult(null); loadStage(startLevel(history), []) }

  const stage = stages[stages.length - 1] as Stage | undefined
  const item = stage?.items[itemIdx]

  const choose = (idx: number) => {
    if (!stage || picked !== null) return
    setPicked(idx)
    setStages(prev => prev.map((s, i) => (i === prev.length - 1 ? { ...s, answers: [...s.answers, idx] } : s)))
  }

  const next = () => {
    if (!stage) return
    if (itemIdx + 1 < stage.items.length) { setItemIdx(itemIdx + 1); setPicked(null); return }
    const level = nextStageLevel(stages)
    if (level !== null) loadStage(level, stages)
    else setPhase('writing')
  }

  const save = async (r: LevelResult) => {
    setSaveState('saving')
    const latest = levelHistory(useAuthStore.getState().user?.user_metadata)
    const { data, error } = await supabase.auth.updateUser({ data: { [LEVELS_KEY]: withResult(latest, r) } })
    if (error || !data.user) { setSaveState('failed'); return }
    useAuthStore.setState({ user: data.user })
    setSaveState('saved')
  }

  const finish = (writingLevel: number | null) => {
    const r = buildResult(stages, writingLevel)
    setResult(r)
    setPhase('results')
    void save(r)
  }

  const submitWriting = async () => {
    const task = writingTask(estimateLevel(stages))
    setPhase('grading')
    try {
      const g = await request<{ level: number; feedback: string; corrected: string }>({ action: 'grade', level: estimateLevel(stages), task: task.prompt, text: writing })
      setGrade(g)
      finish(g.level)
    } catch (err) { fail(err, submitWriting) }
  }

  // Number keys answer, Enter moves on
  useEffect(() => {
    if (phase !== 'question' || !item) return
    const onKey = (e: KeyboardEvent) => {
      if (picked === null && /^Digit[1-4]$/.test(e.code)) { e.preventDefault(); choose(Number(e.code.slice(5)) - 1) }
      else if (picked !== null && e.key === 'Enter') { e.preventDefault(); next() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (phase === 'intro') {
    const last = history[0]
    const due = isLevelCheckDue(history)
    return (
      <div className={styles.page}>
        <div className={styles.eyebrow}>Level check</div>
        <h1 className={styles.title}>Where are you on the HSK scale?</h1>
        <p className={styles.lede}>
          About 10 minutes. Questions adapt as you go: vocabulary, grammar and a short reading, then one writing task.
          Every question is written by Claude and checked by a second, independent pass before you see it.
        </p>
        {last && (
          <div className={styles.lastResult}>
            <span className={styles.levelBadge}>HSK {last.level}</span>
            <span>Last checked {new Date(last.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          </div>
        )}
        <button className={styles.primaryBtn} onClick={begin}>{last ? (due ? 'Take this month’s check' : 'Check again') : 'Start the level check'}</button>
        {history.length > 1 && (
          <div className={styles.history}>
            <div className={styles.sectionLabel}>History</div>
            {history.map(r => (
              <div key={r.date} className={styles.historyRow}>
                <span>{new Date(r.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                <span className={styles.historyLevel}>HSK {r.level}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (phase === 'loading' || phase === 'grading') {
    return (
      <div className={styles.center}>
        <svg className={styles.spinner} width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="11" cy="11" r="8" strokeOpacity="0.2"/><path d="M11 3a8 8 0 0 1 8 8" strokeLinecap="round"/>
        </svg>
        <span>{phase === 'grading' ? 'Reading your writing…' : loadingText}</span>
      </div>
    )
  }

  if (phase === 'error' && error) {
    return (
      <div className={styles.center}>
        <span>{error.message}</span>
        <div className={styles.row}>
          <button className={styles.primaryBtn} onClick={error.retry}>Try again</button>
          <button className={styles.ghostBtn} onClick={() => setPhase('intro')}>Back</button>
        </div>
      </div>
    )
  }

  if (phase === 'question' && stage && item) {
    const answered = picked !== null
    return (
      <div className={styles.page}>
        <div className={styles.progressRow}>
          <span className={styles.eyebrow}>Stage {stages.length} of up to {MAX_STAGES} · HSK {stage.level}</span>
          <span className={styles.count}>{itemIdx + 1} / {stage.items.length}</span>
        </div>
        <div className={styles.progressBar}><div style={{ width: `${((itemIdx + (answered ? 1 : 0)) / stage.items.length) * 100}%` }} /></div>
        <div className={styles.questionCard}>
          <div className={styles.skill}>{item.skill}</div>
          {item.passage && (
            <div className={styles.passage} lang="zh-Hant">
              {item.passage}
              <SpeakButton text={item.passage} className={styles.passageSpeak} />
            </div>
          )}
          <div className={styles.question} lang={chineseLang(item.question)}>{item.question}</div>
        </div>
        <div className={styles.options}>
          {item.options.map((option, i) => {
            const state = !answered ? '' : i === item.answer ? styles.correct : i === picked ? styles.incorrect : styles.dim
            return (
              <button key={i} className={[styles.option, state].join(' ')} onClick={() => choose(i)} disabled={answered}>
                <span className={styles.letter}>{i + 1}</span>
                <span className={styles.optionText} lang={chineseLang(option)}>{option}</span>
              </button>
            )
          })}
        </div>
        {answered && (
          <div className={styles.feedback}>
            <span>
              <strong className={picked === item.answer ? styles.feedbackRight : styles.feedbackWrong}>{picked === item.answer ? 'Correct.' : 'Not quite.'}</strong>
              {item.explanation && ` ${item.explanation}`}
            </span>
            <button className={styles.primaryBtn} onClick={next}>Next</button>
          </div>
        )}
      </div>
    )
  }

  if (phase === 'writing') {
    const level = estimateLevel(stages)
    const task = writingTask(level)
    return (
      <div className={styles.page}>
        <div className={styles.eyebrow}>Last step · {isParagraphTask(level) ? 'paragraph' : 'sentence'}</div>
        <h2 className={styles.subtitle}>{task.prompt}</h2>
        <textarea className={styles.textarea} lang="zh-Hant" rows={isParagraphTask(level) ? 8 : 3}
          value={writing} onChange={e => setWriting(e.target.value)} placeholder={task.hint} maxLength={1500} />
        <div className={styles.row}>
          <button className={styles.primaryBtn} onClick={submitWriting} disabled={!writing.trim()}>Submit</button>
          <button className={styles.ghostBtn} onClick={() => finish(null)}>Skip writing</button>
        </div>
      </div>
    )
  }

  if (phase === 'results' && result) {
    const rows = [...SKILLS, 'writing' as const]
    return (
      <div className={styles.page}>
        <div className={styles.eyebrow}>Your level</div>
        <div className={styles.resultLevel}>HSK {result.level}</div>
        <div className={styles.skillList}>
          {rows.map(skill => {
            const value = result.skills[skill]
            return (
              <div key={skill} className={styles.skillRow}>
                <span className={styles.skillName}>{skill}</span>
                <span className={styles.pips} aria-label={value ? `HSK ${value}` : 'Not tested'}>
                  {Array.from({ length: 6 }, (_, i) => <span key={i} className={value && i < value ? styles.pipOn : styles.pip} />)}
                </span>
                <span className={styles.skillValue}>{value ? `HSK ${value}` : '—'}</span>
              </div>
            )
          })}
        </div>
        {grade && (
          <div className={styles.gradeCard}>
            <div className={styles.sectionLabel}>Writing feedback</div>
            <p>{grade.feedback}</p>
            {grade.corrected && <p className={styles.corrected} lang="zh-Hant">{grade.corrected}</p>}
          </div>
        )}
        <div className={styles.saveNote}>
          {saveState === 'saving' && 'Saving to your account…'}
          {saveState === 'saved' && 'Saved. Your level now shows in the sidebar.'}
          {saveState === 'failed' && <>Couldn’t save this result. <button className={styles.linkBtn} onClick={() => save(result)}>Retry</button></>}
        </div>
        <div className={styles.row}>
          <Link to="/daily" className={styles.primaryBtn}>Do today’s Daily 10</Link>
          <button className={styles.ghostBtn} onClick={() => setPhase('intro')}>Done</button>
        </div>
      </div>
    )
  }

  return null
}
