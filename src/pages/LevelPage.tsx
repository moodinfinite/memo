import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { chineseLang } from '@/lib/cjk'
import {
  LEVELS_KEY, MAX_ABOVE_SHARE, MAX_LEVEL, TOCFL_LEVELS, buildResult, currentResults, estimate, isLegacy, isLevelCheckDue,
  isParagraphTask, levelAt, levelHistory, levelInfo, levelMap, levelName, loadWordList, matchMeaning, nextWordLevel, passageLevels,
  pickWord, profilePassage, rankFor, readingDifficulty, readingSeconds, vocabularyHint, withResult, wordDifficulty, wordsDone,
  writingTask, type Answer, type ListWord, type LevelResult, type RealityRating,
} from '@/lib/levelTest'
import styles from './LevelPage.module.css'

type Phase = 'intro' | 'loading' | 'word' | 'preparing' | 'reading' | 'reality' | 'writing' | 'grading' | 'results' | 'error'

interface WordItem { word: ListWord; typed: string; score: number | null }
interface Question { question: string; options: string[]; answer: number; explanation: string }
interface Passage { level: number; passage: string; questions: Question[]; realWorld: { kind: string; text: string; gist: string } }
interface ReadingItem { level: number; score: number }

/** Level 6 at the top down to Novice, with the learner's level marked */
function LevelChart({ current, label }: { current: number | null; label: string }) {
  return (
    <div className={styles.chart} role="list" aria-label="What each TOCFL level means">
      {[...TOCFL_LEVELS].reverse().map(({ level, name, zh, cefr, words, canDo }) => {
        const here = level === current
        return (
          <div key={level} role="listitem" aria-current={here ? 'true' : undefined}
            className={[styles.chartRow, here ? styles.chartHere : current !== null && level < current ? styles.chartPassed : ''].join(' ')}>
            <span className={styles.chartLevel}>{level === 0 ? 'N' : level}</span>
            <span className={styles.chartText}>
              <span className={styles.chartRank}>{name} <span lang="zh-Hant">{zh}</span><span className={styles.chartWords}> · {cefr} · {words} words</span></span>
              <span className={styles.chartCanDo}>{canDo}</span>
            </span>
            {here && <span className={styles.chartMarker}>{label}</span>}
          </div>
        )
      })}
    </div>
  )
}

const formatDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
const resultLabel = (r: LevelResult) => (isLegacy(r) ? `HSK ${r.level} · old test` : levelName(r.level))

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

/** Words typed so far become answers; meanings Claude hasn't graded yet count as half */
function answersFrom(words: WordItem[], reading: ReadingItem[]): Answer[] {
  return [
    ...words.map(w => ({ difficulty: wordDifficulty(w.word.level), guess: 0, score: w.score ?? 0.5, kind: 'word' as const })),
    ...reading.map(r => ({ difficulty: readingDifficulty(r.level), guess: 0.25, score: r.score, kind: 'reading' as const })),
  ]
}

export default function LevelPage() {
  const user = useAuthStore(s => s.user)
  const history = levelHistory(user?.user_metadata)
  const [phase, setPhase] = useState<Phase>('intro')
  const [loadingText, setLoadingText] = useState('')
  const [error, setError] = useState<{ message: string; retry: () => void } | null>(null)

  const [list, setList] = useState<ListWord[]>([])
  const studied = useRef(new Set<string>())
  // Background grading lands after renders, so the ref is the source of truth and state mirrors it
  const wordsRef = useRef<WordItem[]>([])
  const [words, setWordsState] = useState<WordItem[]>([])
  const updateWords = (fn: (prev: WordItem[]) => WordItem[]) => { wordsRef.current = fn(wordsRef.current); setWordsState(wordsRef.current) }
  const [current, setCurrent] = useState<ListWord | null>(null)
  const [typed, setTyped] = useState('')
  const [revealed, setRevealed] = useState<WordItem | null>(null)

  const passages = useRef(new Map<number, Promise<Passage | null>>())
  const [passage, setPassage] = useState<Passage | null>(null)
  const [readOrder, setReadOrder] = useState<number[]>([])
  const [qIdx, setQIdx] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const [reading, setReading] = useState<ReadingItem[]>([])
  const [startedAt, setStartedAt] = useState(0)
  const [now, setNow] = useState(Date.now())

  const [reality, setReality] = useState<{ level: number; kind: string; text: string; gist: string } | null>(null)
  const [rating, setRating] = useState<RealityRating | null>(null)
  const [writing, setWriting] = useState('')
  const [grade, setGrade] = useState<{ level: number; feedback: string; corrected: string } | null>(null)
  const [result, setResult] = useState<ReturnType<typeof buildResult> | null>(null)
  const [saveState, setSaveState] = useState<'saving' | 'saved' | 'failed'>('saving')

  const controllers = useRef(new Set<AbortController>())
  const grading = useRef(new Map<string, Promise<void>>())
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; controllers.current.forEach(c => c.abort()) }
  }, [])

  const api = <T,>(body: Record<string, unknown>) => {
    const c = new AbortController()
    controllers.current.add(c)
    const deadline = setTimeout(() => c.abort(), 50_000)
    return callLevelAPI<T>(body, c.signal).finally(() => { clearTimeout(deadline); controllers.current.delete(c) })
  }
  const fail = (err: any, retry: () => void) => {
    if (!mounted.current) return
    setError({ message: err?.name === 'AbortError' ? 'That took too long. Try again.' : err?.message ?? 'Something went wrong', retry })
    setPhase('error')
  }

  // ── Words ──

  const begin = async () => {
    setPhase('loading')
    setLoadingText('Loading the TOCFL word list…')
    try {
      const loaded = await loadWordList()
      try {
        const { data } = await supabase.from('cards').select('term').limit(5000)
        studied.current = new Set((data ?? []).map((c: { term: string }) => c.term.trim()))
      } catch { studied.current = new Set() }
      passages.current.clear()
      grading.current.clear()
      setList(loaded)
      updateWords(() => [])
      setReading([]); setPassage(null); setReadOrder([]); setReality(null); setRating(null)
      setWriting(''); setGrade(null); setResult(null); setRevealed(null); setTyped('')
      setCurrent(pickWord(loaded, nextWordLevel(estimate([])), new Set(), studied.current))
      setPhase('word')
    } catch (err) { fail(err, begin) }
  }

  /** Claude grades typed meanings the app couldn't match, a few at a time in the background */
  const gradePending = () => {
    const pending = wordsRef.current.filter(w => w.score === null && !grading.current.has(w.word.forms[0]))
    if (!pending.length) return
    const keys = pending.map(w => w.word.forms[0])
    const job = api<{ scores: number[] }>({
      action: 'meanings',
      items: pending.map(w => ({ word: w.word.forms[0], pinyin: w.word.pinyin, meaning: w.word.meaning, answer: w.typed })),
    }).then(({ scores }) => {
      updateWords(prev => prev.map(w => { const i = keys.indexOf(w.word.forms[0]); return i >= 0 && w.score === null ? { ...w, score: scores[i] ?? 0 } : w }))
    }).catch(() => { keys.forEach(k => grading.current.delete(k)) })
    keys.forEach(k => grading.current.set(k, job))
  }

  const submitWord = (answer: string) => {
    if (!current || revealed) return
    const item: WordItem = { word: current, typed: answer.trim(), score: matchMeaning(answer, current.meaning) }
    updateWords(prev => [...prev, item])
    setRevealed(item)
    if (wordsRef.current.filter(w => w.score === null && !grading.current.has(w.word.forms[0])).length >= 4) gradePending()
  }

  const nextWord = () => {
    const answers = answersFrom(wordsRef.current, [])
    const e = estimate(answers)
    setRevealed(null)
    setTyped('')
    const asked = new Set(wordsRef.current.map(w => w.word.forms[0]))
    const word = wordsDone(answers, e) ? null : pickWord(list, nextWordLevel(e), asked, studied.current)
    if (word) { setCurrent(word); return }
    void prepareReading()
  }

  // ── Reading ──

  /** Writes a passage at `level`, rejects it if too many words sit above the level, then checks the questions */
  const writePassage = async (level: number): Promise<Passage | null> => {
    const levels = levelMap(list)
    for (let attempt = 0; attempt < 2; attempt++) {
      const out = await api<Omit<Passage, 'level'>>({ action: 'passage', level, ...vocabularyHint(list, level) })
      if (!out.passage || profilePassage(out.passage, levels, level).share > MAX_ABOVE_SHARE) continue
      const { keep } = await api<{ keep: number[] }>({ action: 'verify', level, passage: out.passage, questions: out.questions })
      const questions = keep.map(i => out.questions[i])
      if (questions.length >= 2 || (attempt === 1 && questions.length)) return { level, ...out, questions }
    }
    return null
  }
  const passageAt = (level: number) => {
    let job = passages.current.get(level)
    if (!job) {
      job = writePassage(level)
      job.catch(() => passages.current.delete(level))
      passages.current.set(level, job)
    }
    return job
  }

  const prepareReading = async () => {
    setPhase('preparing')
    setLoadingText('Checking your answers…')
    try {
      // Grade whatever is left (one retry for a failed batch) before choosing the passage level
      for (let pass = 0; pass < 2; pass++) { gradePending(); await Promise.all(grading.current.values()) }
      const levels = passageLevels(estimate(answersFrom(wordsRef.current, [])))
      setLoadingText(`Writing a ${levelName(levels[0])} passage…`)
      levels.forEach(l => void passageAt(l).catch(() => null))
      const p = await passageAt(levels[0])
      if (!mounted.current) return
      if (!p) throw new Error('Could not write a reliable reading passage this time. Try again.')
      setReadOrder([levels[0]])
      startPassage(p)
    } catch (err) {
      passages.current.clear()
      fail(err, prepareReading)
    }
  }

  const startPassage = (p: Passage) => {
    setPassage(p)
    setQIdx(0)
    setPicked(null)
    setStartedAt(Date.now())
    setNow(Date.now())
    setPhase('reading')
  }

  const limit = passage ? readingSeconds(passage.passage, passage.questions.length) * 1000 : 0
  useEffect(() => {
    if (phase !== 'reading') return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [phase])

  const choose = (idx: number) => {
    if (!passage || picked !== null) return
    const q = passage.questions[qIdx]
    setPicked(idx)
    const onTime = Date.now() - startedAt <= limit
    setReading(prev => [...prev, { level: passage.level, score: idx === q.answer ? (onTime ? 1 : 0.5) : 0 }])
  }

  const afterQuestion = async () => {
    if (!passage) return
    if (qIdx + 1 < passage.questions.length) { setQIdx(qIdx + 1); setPicked(null); return }
    if (readOrder.length === 1) {
      // Strong on the first passage: try one level up; otherwise one level down
      const mine = reading.filter(r => r.level === passage.level)
      const up = mine.reduce((s, r) => s + r.score, 0) / mine.length >= 2 / 3
      for (const level of up ? [passage.level + 1, passage.level - 1] : [passage.level - 1, passage.level + 1]) {
        if (!passages.current.has(level)) continue
        setPhase('preparing')
        setLoadingText(`Writing a ${levelName(level)} passage…`)
        const p = await passageAt(level).catch(() => null)
        if (!mounted.current) return
        if (p) { setReadOrder([readOrder[0], level]); startPassage(p); return }
      }
    }
    void showReality()
  }

  const showReality = async () => {
    const level = levelAt(estimate(answersFrom(wordsRef.current, reading)), 0.7)
    // The real-world text from the written passage closest to the estimate
    const ready = (await Promise.all([...passages.current.values()].map(p => p.catch(() => null))))
      .filter((p): p is Passage => !!p?.realWorld?.text)
    const nearest = ready.sort((a, b) => Math.abs(a.level - level) - Math.abs(b.level - level))[0]
    if (!mounted.current) return
    if (!nearest) { setPhase('writing'); return }
    setReality({ level: nearest.level, ...nearest.realWorld })
    setRating(null)
    setPhase('reality')
  }

  // ── Writing and results ──

  const estimatedLevel = () => levelAt(estimate(answersFrom(wordsRef.current, reading)), 0.7)

  const save = async (r: LevelResult) => {
    setSaveState('saving')
    const latest = levelHistory(useAuthStore.getState().user?.user_metadata)
    const { data, error } = await supabase.auth.updateUser({ data: { [LEVELS_KEY]: withResult(latest, r) } })
    if (error || !data.user) { setSaveState('failed'); return }
    useAuthStore.setState({ user: data.user })
    setSaveState('saved')
  }
  const saveResult = (r: ReturnType<typeof buildResult>) => {
    const { capped: _capped, ...saved } = r
    void save(saved)
  }

  const finish = (writingLevel: number | null) => {
    const r = buildResult(answersFrom(wordsRef.current, reading), writingLevel, rating)
    setResult(r)
    setPhase('results')
    saveResult(r)
  }

  const submitWriting = async () => {
    const level = estimatedLevel()
    setPhase('grading')
    try {
      const g = await api<{ level: number; feedback: string; corrected: string }>({ action: 'grade', level, task: writingTask(level).prompt, text: writing })
      setGrade(g)
      finish(g.level)
    } catch (err) { fail(err, submitWriting) }
  }

  // Number keys answer reading questions; Enter moves on. (Words need no handler: Next takes focus, so Enter presses it.)
  useEffect(() => {
    if (phase !== 'reading' || !passage) return
    const onKey = (e: KeyboardEvent) => {
      if (picked === null && /^Digit[1-4]$/.test(e.code)) { e.preventDefault(); choose(Number(e.code.slice(5)) - 1) }
      else if (picked !== null && e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); void afterQuestion() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (phase === 'intro') {
    const latest = currentResults(history)[0]
    const legacy = !latest ? history.find(isLegacy) : undefined
    const due = isLevelCheckDue(history)
    return (
      <div className={styles.page}>
        <div className={styles.eyebrow}>Level check</div>
        <h1 className={styles.title}>Where are you on the TOCFL scale?</h1>
        <p className={styles.lede}>
          About 10 minutes, on Taiwan’s own scale for Traditional Chinese. First you type what 20–30 words mean. They come from
          the official TOCFL word list and get harder or easier as you go. Then you read two short passages against a loose
          timer, say how much of a real-world text you can read, and write a few sentences.
        </p>
        {latest && (
          <div className={styles.lastResult}>
            <span className={styles.levelBadge}>{levelName(latest.level)}</span>
            <span>Last checked {formatDate(latest.date)}</span>
          </div>
        )}
        {legacy && (
          <p className={styles.note}>
            Your earlier result (HSK {legacy.level}) came from the old test, which wrote its own questions and overrated levels.
            This check replaces it.
          </p>
        )}
        <button className={styles.primaryBtn} onClick={begin}>{latest ? (due ? 'Take this month’s check' : 'Check again') : 'Start the level check'}</button>
        <div className={styles.sectionLabel}>What the levels mean</div>
        <LevelChart current={latest?.level ?? null} label="You" />
        <p className={styles.footnote}>
          Word counts are the size of the official TOCFL list up to each level. Reading descriptions follow the CEFR level each
          band is aligned to, in our own words.
        </p>
        {history.length > 0 && (
          <div className={styles.history}>
            <div className={styles.sectionLabel}>History</div>
            {history.map(r => (
              <div key={r.date} className={styles.historyRow}>
                <span>{formatDate(r.date)}</span>
                <span className={isLegacy(r) ? styles.historyLegacy : styles.historyLevel}>{resultLabel(r)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (phase === 'loading' || phase === 'preparing' || phase === 'grading') {
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

  if (phase === 'word' && current) {
    const done = words.length
    return (
      <div className={styles.page}>
        <div className={styles.progressRow}>
          <span className={styles.eyebrow}>Part 1 of 3 · Words</span>
          <span className={styles.count}>{done + (revealed ? 0 : 1)} of 20–30</span>
        </div>
        <div className={styles.progressBar}><div style={{ width: `${Math.min(100, (done / 20) * 100)}%` }} /></div>
        <div className={styles.questionCard}>
          <div className={styles.wordTerm} lang="zh-Hant">{current.forms[0]}</div>
          {!revealed ? (
            <form className={styles.wordForm} onSubmit={e => { e.preventDefault(); if (typed.trim()) submitWord(typed) }}>
              <label className={styles.skill} htmlFor="meaning">What does it mean in English?</label>
              <input id="meaning" className={styles.meaningInput} value={typed} onChange={e => setTyped(e.target.value)}
                autoFocus autoComplete="off" autoCapitalize="off" spellCheck={false} maxLength={100} placeholder="Type a meaning" />
              <div className={styles.row}>
                <button type="submit" className={styles.primaryBtn} disabled={!typed.trim()}>Check</button>
                <button type="button" className={styles.ghostBtn} onClick={() => submitWord('')}>Don’t know</button>
              </div>
            </form>
          ) : (
            <div className={styles.wordReveal}>
              <span className={styles.revealPinyin}>{current.pinyin}</span>
              <span>{current.meaning}</span>
              <span className={revealed.score === 1 ? styles.feedbackRight : revealed.score === 0 ? styles.feedbackWrong : styles.feedbackPending}>
                {revealed.score === 1 ? 'Yes.' : revealed.score === 0 ? (revealed.typed ? 'Not quite.' : 'Noted.') : 'Claude will check your answer.'}
              </span>
            </div>
          )}
        </div>
        {revealed && <button className={styles.primaryBtn} onClick={nextWord} autoFocus>Next</button>}
      </div>
    )
  }

  if (phase === 'reading' && passage) {
    const q = passage.questions[qIdx]
    const answered = picked !== null
    const left = Math.max(0, limit - (now - startedAt))
    return (
      <div className={styles.page}>
        <div className={styles.progressRow}>
          <span className={styles.eyebrow}>Part 2 of 3 · Reading {readOrder.length} of 2</span>
          <span className={styles.count}>{qIdx + 1} / {passage.questions.length}</span>
        </div>
        <div className={styles.timer} aria-hidden="true"><div style={{ width: `${(left / limit) * 100}%` }} /></div>
        <div className={styles.questionCard}>
          <div className={styles.passage} lang="zh-Hant">{passage.passage}</div>
          <div className={styles.question} lang={chineseLang(q.question)}>{q.question}</div>
        </div>
        <div className={styles.options}>
          {q.options.map((option, i) => {
            const state = !answered ? '' : i === q.answer ? styles.correct : i === picked ? styles.incorrect : styles.dim
            return (
              <button key={i} className={[styles.option, state].join(' ')} onClick={() => choose(i)} disabled={answered}>
                <span className={styles.letter}>{i + 1}</span>
                <span className={styles.optionText} lang={chineseLang(option)}>{option}</span>
              </button>
            )
          })}
          {!answered && <button className={styles.dontKnow} onClick={() => choose(-1)}>I don’t know</button>}
        </div>
        {answered && (
          <div className={styles.feedback}>
            <span>
              <strong className={picked === q.answer ? styles.feedbackRight : styles.feedbackWrong}>{picked === q.answer ? 'Correct.' : 'Not quite.'}</strong>
              {q.explanation && ` ${q.explanation}`}
              {left === 0 && picked === q.answer && ' Answered after the timer, so it counts half.'}
            </span>
            <button className={styles.primaryBtn} onClick={() => void afterQuestion()}>Next</button>
          </div>
        )}
        {left === 0 && !answered && <div className={styles.footnote}>Time’s up for this passage. You can still answer, but it counts half.</div>}
      </div>
    )
  }

  if (phase === 'reality' && reality) {
    const options: { value: RealityRating; label: string }[] = [
      { value: 'most', label: 'Almost all of it' },
      { value: 'some', label: 'About half' },
      { value: 'little', label: 'Very little' },
    ]
    return (
      <div className={styles.page}>
        <div className={styles.eyebrow}>Part 3 of 3 · Real-world check</div>
        <h2 className={styles.subtitle}>How much of this can you read?</h2>
        <div className={styles.realWorld}>
          <div className={styles.skill}>{reality.kind}</div>
          <div className={styles.realText} lang="zh-Hant">{reality.text}</div>
        </div>
        {!rating ? (
          <div className={styles.row}>
            {options.map(o => <button key={o.value} className={styles.ghostBtn} onClick={() => setRating(o.value)}>{o.label}</button>)}
          </div>
        ) : (
          <>
            <p className={styles.lede}><strong>What it says:</strong> {reality.gist}</p>
            <button className={styles.primaryBtn} onClick={() => setPhase('writing')} autoFocus>Continue</button>
          </>
        )}
      </div>
    )
  }

  if (phase === 'writing') {
    const level = estimatedLevel()
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
    const info = levelInfo(result.level)
    const [low, high] = result.range ?? [result.level, result.level]
    const rank = rankFor(result.level)
    return (
      <div className={styles.page}>
        <div className={styles.eyebrow}>Your level</div>
        <div className={styles.resultLevel}>{info.name}</div>
        <div className={styles.resultMeta}>
          <span lang="zh-Hant">{info.zh}</span> · {info.cefr} · {rank.en} <span lang="zh-Hant">{rank.zh}</span>
        </div>
        {(high > low || result.capped || result.level >= 5) && (
          <p className={styles.lede}>
            {result.capped
              ? `Your words and reading point to ${levelName(result.level + 1)}, but the real-world text was hard to read, so we report ${levelName(result.level)}. `
              : high > low && `Somewhere between ${levelName(low)} and ${levelName(high)}. We report the lower end. `}
            {result.level >= 5 && 'The word list stops at Level 5, so this check can’t confirm Level 6.'}
          </p>
        )}
        <div className={styles.skillList}>
          {(['vocabulary', 'reading', 'writing'] as const).map(skill => {
            const value = result.skills[skill] ?? null
            return (
              <div key={skill} className={styles.skillRow}>
                <span className={styles.skillName}>{skill}</span>
                <span className={styles.pips} aria-label={value !== null ? levelName(value) : 'Not tested'}>
                  {Array.from({ length: MAX_LEVEL }, (_, i) => <span key={i} className={value !== null && i < value ? styles.pipOn : styles.pip} />)}
                </span>
                <span className={styles.skillValue}>{value === null ? '—' : value === 0 ? 'Novice' : `L${value}`}</span>
              </div>
            )
          })}
        </div>
        <div className={styles.sectionLabel}>Where that puts you</div>
        <LevelChart current={result.level} label="You’re here" />
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
          {saveState === 'failed' && <>Couldn’t save this result. <button className={styles.linkBtn} onClick={() => saveResult(result)}>Retry</button></>}
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
