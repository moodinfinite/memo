import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { readAllRows } from '@/lib/readAllRows'
import { useAuthStore } from '@/store/authStore'
import { useSRSStore } from '@/store/srsStore'
import { currentResults, levelHistory, loadWordList, type ListWord } from '@/lib/levelTest'
import { buildUnits, indexCards, migrateProgress, parsePathTags, readProgress, taggedLevels, unitStage, wordState, type CardRef, type PathTag } from '@/lib/path'

let tagsPending: Promise<Map<string, PathTag>> | null = null
export const loadTags = () => {
  if (!tagsPending) {
    tagsPending = fetch('/path-tags.txt').then(r => { if (!r.ok) throw new Error(`Path data unavailable (${r.status})`); return r.text() }).then(parsePathTags)
    tagsPending.catch(() => { tagsPending = null })
  }
  return tagsPending
}

/** Last cards and sets read, so Home and the path open without a blank wait when revisited */
let cache: { user: string; cards: CardRef[]; pathSets: { id: string; title: string }[] } | null = null

/**
 * Everything the learning path needs, shared by the Path page and the alley on Home: the word list, the
 * one-off tags, the learner's cards (to know which path words are added, studied or already in their own
 * sets), and where they are on each level from their start level up.
 */
export function usePath() {
  const user = useAuthStore(s => s.user)
  const cardSRS = useSRSStore(s => s.cardSRS)
  const cached = cache && cache.user === user?.id ? cache : null
  const [list, setList] = useState<ListWord[] | null>(null)
  const [tags, setTags] = useState<Map<string, PathTag> | null>(null)
  const [cards, setCardsState] = useState<CardRef[] | null>(cached?.cards ?? null)
  const [pathSets, setPathSetsState] = useState<{ id: string; title: string }[] | null>(cached?.pathSets ?? null)
  const [failed, setFailed] = useState<string | null>(null)

  const remember = (c: CardRef[] | null, s: { id: string; title: string }[] | null) => { if (user && c && s) cache = { user: user.id, cards: c, pathSets: s } }
  const setCards = (update: (prev: CardRef[]) => CardRef[]) => setCardsState(prev => { const next = update(prev ?? []); remember(next, pathSets); return next })
  const setPathSets = (update: (prev: { id: string; title: string }[]) => { id: string; title: string }[]) =>
    setPathSetsState(prev => { const next = update(prev ?? []); remember(cards, next); return next })

  const reload = () => {
    if (!user) return
    setFailed(null)
    void useSRSStore.getState().fetchAllSRS()
    Promise.all([
      loadWordList(), loadTags(),
      readAllRows<CardRef>((from, to, signal) => supabase.from('cards').select('id, set_id, term, definition').eq('user_id', user.id).order('id').range(from, to).abortSignal(signal)),
      supabase.from('sets').select('id, title').eq('user_id', user.id),
    ]).then(([words, t, cardRows, setRows]) => {
      if (cardRows.error || setRows.error) throw new Error('Could not load your sets')
      const nextSets = ((setRows.data ?? []) as { id: string; title: string }[]).filter(s => s.title.startsWith('Path · '))
      setList(words); setTags(t); setCardsState(cardRows.data ?? []); setPathSetsState(nextSets)
      remember(cardRows.data ?? [], nextSets)
    }).catch(err => setFailed(err?.message ?? 'Something went wrong'))
  }
  useEffect(reload, [user?.id])

  const meta = user?.user_metadata
  const saved = readProgress(meta)
  // Progress saved under an older unit layout is carried over by the words it covered; the next save stores it
  const progress = useMemo(() => list && tags ? migrateProgress(saved, list, tags) : saved, [list, tags, JSON.stringify(saved)])
  const latest = currentResults(levelHistory(meta))[0]
  const start = progress.start ?? latest?.level ?? null

  const index = useMemo(() => cards && pathSets ? indexCards(cards, new Set(pathSets.map(s => s.id))) : null, [cards, pathSets])
  const seen = (id: string) => !!cardSRS[id]

  const levels = useMemo(() => {
    if (!list || !tags || start === null || !index) return []
    return taggedLevels(tags).filter(l => l >= start).map(level => {
      const units = buildUnits(list, tags, level)
      const states = units.map(u => u.words.map(w => wordState(w, index, seen).state))
      const stages = states.map(unitStage)
      const done = progress.done[level] ?? 0
      const current = units.findIndex((_, i) => i >= done && stages[i] !== 'skip')
      return {
        level, units, states, stages, current, complete: current < 0,
        /** Units finished or skipped, counting from the start of the level */
        doneCount: current < 0 ? units.length : current,
        words: units.reduce((n, u) => n + u.words.length, 0), covered: states.flat().filter(s => s !== 'new').length,
      }
    })
  }, [list, tags, start, index, cardSRS, JSON.stringify(progress.done)])

  /** The level the learner is on: the first one not finished, else the last */
  const onLevel = levels.find(l => !l.complete) ?? levels[levels.length - 1]

  return { user, list, tags, cards, pathSets, index, failed, reload, setCards, setPathSets, setFailed, progress, latest, start, levels, onLevel, seen }
}

export type PathLevel = ReturnType<typeof usePath>['levels'][number]
