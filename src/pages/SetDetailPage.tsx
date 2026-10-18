import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useSetsStore } from '@/store/setsStore'
import { useFoldersStore } from '@/store/foldersStore'
import { useSRSStore } from '@/store/srsStore'
import { getMasteryLevel, getSetMastery, MASTERY_INFO } from '@/lib/mastery'
import { SetDetailSkeleton } from '@/components/ui/Skeleton'
import styles from './SetDetailPage.module.css'

function StarburstBadge({ level }: { level: 0 | 1 | 2 | 3 | 4 }) {
  // Unseen cards keep the badge's width so every row's term/definition divider lines up
  if (level === 0) return <div className={styles.starPlaceholder} aria-hidden="true" />
  const { color, label } = MASTERY_INFO[level]
  // 8-point starburst path (24×24 viewBox, outer r=11, inner r=5)
  const pts: string[] = []
  for (let i = 0; i < 16; i++) {
    const angle = (i * Math.PI) / 8 - Math.PI / 2
    const r = i % 2 === 0 ? 11 : 5
    pts.push(`${12 + r * Math.cos(angle)},${12 + r * Math.sin(angle)}`)
  }
  const d = `M${pts.join('L')}Z`
  const { description } = MASTERY_INFO[level]
  return (
    <div className={styles.starWrap}>
      <svg width="20" height="20" viewBox="0 0 24 24" style={{ fill: color }}>
        <path d={d} />
      </svg>
      <span className={styles.starLevel}>{level}</span>
      <div className={styles.starTooltip}>
        <strong>{label}</strong> · Level {level}<br />
        <span>{description}</span>
      </div>
    </div>
  )
}

type CardSort = 'original' | 'weakest' | 'strongest'
const sortPreferenceKey = 'memo-card-sort'
const SORT_OPTIONS: { id: CardSort; label: string }[] = [
  { id: 'original', label: 'Original' },
  { id: 'weakest', label: 'Weakest first' },
  { id: 'strongest', label: 'Strongest first' },
]

export default function SetDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { currentSet, fetchSet, deleteSet, moveToFolder, isLoading, error, pendingSaves, saveErrors, retrySave } = useSetsStore()
  const { folders } = useFoldersStore()
  const { cardSRS, fetchSRS } = useSRSStore()
  const [showFolderPicker, setShowFolderPicker] = useState(false)
  const [exported, setExported] = useState(false)
  const [sort, setSort] = useState<CardSort>(() => {
    try {
      const saved = localStorage.getItem(sortPreferenceKey)
      return saved === 'weakest' || saved === 'strongest' ? saved : 'original'
    } catch { return 'original' }
  })
  const folderPickerRef = useRef<HTMLDivElement>(null)

  const chooseSort = (next: CardSort) => {
    setSort(next)
    try { localStorage.setItem(sortPreferenceKey, next) } catch { /* Sorting still works without device storage. */ }
  }

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (folderPickerRef.current && !folderPickerRef.current.contains(e.target as Node)) setShowFolderPicker(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => { if (id) { fetchSet(id); fetchSRS(id) } }, [id])

  const handleMoveToFolder = async (folderId: string | null) => {
    if (!currentSet) return
    await moveToFolder(currentSet.id, folderId)
    setShowFolderPicker(false)
  }

  const handleExport = () => {
    if (!currentSet?.cards?.length) return
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`
    const rows = [['Term', 'Definition'], ...currentSet.cards.map(c => [esc(c.term), esc(c.definition)])]
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${currentSet.title.replace(/[^a-z0-9]/gi, '_')}.csv`
    a.click()
    URL.revokeObjectURL(url)
    setExported(true)
    setTimeout(() => setExported(false), 2000)
  }

  const handleDelete = async () => {
    if (!currentSet) return
    if (!window.confirm(`Delete "${currentSet.title}"? This can't be undone.`)) return
    await deleteSet(currentSet.id)
    navigate('/')
  }

  if (isLoading && !currentSet) return <SetDetailSkeleton />
  if (error && !currentSet) return (
    <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-secondary)' }}>
      <p style={{ marginBottom: 16 }}>Failed to load set — {error}</p>
      <button onClick={() => id && fetchSet(id)} style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--bg-raised)', cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 'var(--text-body)' }}>Try again</button>
    </div>
  )
  if (!currentSet) return null

  const cards = currentSet.cards ?? []
  const cardsLoading = cards.length === 0 && (currentSet.cardCount ?? 0) > 0
  const total = cards.length
  const progress = getSetMastery(currentSet.id, total, cardSRS, cards.map(card => card.id))
  const { masteredCount, learningCount } = progress
  const untouchedCount = total - masteredCount - learningCount

  // Ties within a mastery level go by review interval, then original position
  const rows = cards.map((card, index) => ({ card, index, level: getMasteryLevel(cardSRS[card.id]), interval: cardSRS[card.id]?.interval ?? 0 }))
  const direction = sort === 'strongest' ? -1 : 1
  const sortedRows = sort === 'original' ? rows
    : [...rows].sort((a, b) => direction * (a.level - b.level || a.interval - b.interval) || a.index - b.index)

  const isSyncing = id ? pendingSaves.includes(id) : false
  const syncError = id ? saveErrors[id] : undefined

  return (
    <div className={styles.page}>
      {isSyncing && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)', fontSize: 'var(--text-body)', color: 'var(--text-secondary)' }}>
          <svg style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="7" cy="7" r="5" strokeOpacity="0.2"/><path d="M7 2a5 5 0 0 1 5 5" strokeLinecap="round"/></svg>
          Saving your set…
        </div>
      )}
      {syncError && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 14px', borderRadius: 10, background: 'var(--red-subtle)', border: '1px solid var(--red-border)', fontSize: 'var(--text-body)', color: 'var(--red-text)' }}>
          <span>Save failed — your set isn't stored yet</span>
          <button onClick={() => id && retrySave(id)} style={{ flexShrink: 0, padding: '4px 12px', borderRadius: 6, border: '1px solid currentColor', background: 'transparent', color: 'inherit', fontFamily: 'var(--font)', fontSize: 'var(--text-body)', cursor: 'pointer', fontWeight: 500 }}>Retry</button>
        </div>
      )}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{currentSet.title}</h1>
          {currentSet.description && <p className={styles.desc}>{currentSet.description}</p>}
          <p className={styles.meta}>{currentSet.cardCount ?? currentSet.cards?.length ?? 0} cards</p>
          <div className={styles.folderRow} ref={folderPickerRef}>
            {(() => {
              const folder = folders.find(f => f.id === currentSet.folder_id)
              return (
                <button className={styles.folderBadgeBtn} onClick={() => setShowFolderPicker(v => !v)}>
                  {folder
                    ? <><span className={styles.folderDot} style={{ background: folder.color }} />{folder.name}</>
                    : <><span className={styles.folderDotEmpty} />No folder</>
                  }
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 4l3 3 3-3"/></svg>
                </button>
              )
            })()}
            {showFolderPicker && (
              <div className={styles.folderDropdown}>
                <button className={styles.folderOption} onClick={() => handleMoveToFolder(null)}>
                  <span className={styles.folderDotEmpty} />No folder
                  {!currentSet.folder_id && <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 6l4 4 6-7"/></svg>}
                </button>
                {folders.map(f => (
                  <button key={f.id} className={styles.folderOption} onClick={() => handleMoveToFolder(f.id)}>
                    <span className={styles.folderDot} style={{ background: f.color }} />{f.name}
                    {currentSet.folder_id === f.id && <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 6l4 4 6-7"/></svg>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className={styles.actions}>
          <Link to={`/sets/${id}/study`} className={styles.studyBtn}>Study</Link>
          <Link to={`/sets/${id}/edit`} className={styles.editBtn}>Edit</Link>
          <button className={styles.deleteBtn} onClick={handleDelete}>Delete</button>
          <button className={styles.exportBtn} onClick={handleExport} title="Export as CSV">
            {exported
              ? <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 8l3.5 3.5 7.5-7"/></svg>
              : <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M7.5 1v9M4 7l3.5 3.5L11 7"/><path d="M2 11.5v1a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-1"/></svg>
            }
          </button>
        </div>
      </div>

      <div className={styles.progressSummary}>
        <div className={styles.progressSummaryTop}>
          <span className={styles.progressSummaryTitle}>Mastery</span>
          <span className={styles.progressSummaryPct}>{progress.pct}%</span>
        </div>
        <div className={styles.progressBar} role="progressbar" aria-label="Mastery" aria-valuenow={progress.pct} aria-valuemin={0} aria-valuemax={100} title="Average card mastery. Correct recall on separate days builds it.">
          <div className={styles.progressBarMastered} style={{ width: `${progress.pct}%` }} />
        </div>
        <div className={styles.progressLegend}>
          <span className={styles.legendMastered}>● {masteredCount} mastered</span>
          <span className={styles.legendLearning}>● {learningCount} learning</span>
          <span className={styles.legendUntouched}>● {untouchedCount} not started</span>
        </div>
      </div>

      <div className={styles.listHeader}>
        <div className={styles.sectionLabel}>All cards</div>
        <div className={styles.sortToggle} role="group" aria-label="Sort cards">
          {SORT_OPTIONS.map(option => (
            <button key={option.id} type="button" aria-pressed={sort === option.id} onClick={() => chooseSort(option.id)}>{option.label}</button>
          ))}
        </div>
      </div>

      <div className={styles.cardList}>
        {cardsLoading && Array.from({ length: Math.min(currentSet.cardCount ?? 3, 8) }).map((_, i) => (
          <div key={i} className={styles.cardRow} style={{ opacity: 0.4 + i * 0.02 }}>
            <span className={styles.rowNum}>{i + 1}</span>
            <div className={styles.rowContent}>
              <div className={styles.term} style={{ background: 'var(--bg-overlay)', borderRadius: 4, color: 'transparent', userSelect: 'none' }}>loading</div>
              <div className={styles.divider} />
              <div className={styles.definition} style={{ background: 'var(--bg-overlay)', borderRadius: 4, color: 'transparent', userSelect: 'none' }}>loading placeholder text here</div>
            </div>
          </div>
        ))}
        {!cardsLoading && sortedRows.map(({ card, index, level }) => {
          return (
            <div key={card.id} className={styles.cardRow}>
              <span className={styles.rowNum}>{index + 1}</span>
              <div className={styles.rowContent}>
                <div className={styles.term}>{card.term}</div>
                <div className={styles.divider} />
                <div className={styles.definition}>{card.definition}</div>
              </div>
              <StarburstBadge level={level} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
