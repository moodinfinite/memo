import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useSetsStore } from '@/store/setsStore'
import { useFoldersStore } from '@/store/foldersStore'
import type { FlashcardSet } from '@/lib/database.types'
import styles from './AllSetsPage.module.css'
import homeStyles from './HomePage.module.css'

export default function AllSetsPage() {
  const { sets, fetchSets, searchSets, togglePin, isLoading } = useSetsStore()
  const { folders } = useFoldersStore()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [activeFolder, setActiveFolder] = useState<string | null>(null)

  useEffect(() => { fetchSets() }, [])

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setQuery(val)
    setActiveFolder(null)
    if (val.trim()) searchSets(val.trim()); else fetchSets()
  }

  const totalCards = sets.reduce((a, s) => a + (s.cardCount ?? 0), 0)

  const displayed = query
    ? sets
    : activeFolder
      ? sets.filter((s) => s.folder_id === activeFolder)
      : sets

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>All Sets</h1>
          <p className={styles.sub}>{sets.length} set{sets.length === 1 ? '' : 's'} · {totalCards} cards</p>
        </div>
        <Link to="/sets/new" className={homeStyles.newBtn}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6.5 1v11M1 6.5h11"/></svg>
          New set
        </Link>
      </div>

      <div className={homeStyles.searchWrap}>
        <svg className={homeStyles.searchIcon} width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="6.5" cy="6.5" r="4.5"/><path d="M10.5 10.5l3 3"/></svg>
        <input className={homeStyles.searchInput} type="text" value={query} onChange={handleSearch} placeholder="Search all sets…"/>
        {query && <button className={homeStyles.searchClear} onClick={() => { setQuery(''); fetchSets() }}><svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M1 1l11 11M12 1L1 12"/></svg></button>}
      </div>

      {!query && folders.length > 0 && (
        <div className={styles.filterRow}>
          <button
            className={[styles.filterPill, activeFolder === null ? styles.filterPillActive : ''].join(' ')}
            onClick={() => setActiveFolder(null)}
          >All</button>
          {folders.map((f) => (
            <button
              key={f.id}
              className={[styles.filterPill, activeFolder === f.id ? styles.filterPillActive : ''].join(' ')}
              onClick={() => setActiveFolder(f.id)}
            >
              <span className={styles.filterDot} style={{ background: f.color }} />
              {f.name}
            </button>
          ))}
        </div>
      )}

      {isLoading && <div className={homeStyles.loading}>Loading…</div>}

      {!isLoading && sets.length === 0 && !query && (
        <div className={homeStyles.empty}>
          <div className={homeStyles.emptyIcon}><svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="5" width="22" height="18" rx="3"/><path d="M9 11h10M9 16h7"/></svg></div>
          <div className={homeStyles.emptyTitle}>No sets yet</div>
          <div className={homeStyles.emptySub}>Create a set to start studying</div>
          <Link to="/sets/new" className={homeStyles.emptyBtn}>Create your first set</Link>
        </div>
      )}

      {!isLoading && displayed.length === 0 && (query || activeFolder) && (
        <div className={homeStyles.empty}>
          <div className={homeStyles.emptyTitle}>{query ? `No sets match "${query}"` : 'No sets in this folder'}</div>
          <div className={homeStyles.emptySub}>{query ? 'Try a different search term' : 'Add sets to this folder from the set detail page'}</div>
        </div>
      )}

      {!isLoading && displayed.length > 0 && (
        <div className={homeStyles.grid}>
          {displayed.map((s) => (
            <SetCard key={s.id} set={s} folders={folders} onPin={() => togglePin(s.id)} onNavigate={() => navigate(`/sets/${s.id}`)} />
          ))}
        </div>
      )}
    </div>
  )
}

function SetCard({ set, folders, onPin, onNavigate }: {
  set: FlashcardSet
  folders: { id: string; name: string; color: string }[]
  onPin: () => void
  onNavigate: () => void
}) {
  const folder = folders.find((f) => f.id === set.folder_id)
  return (
    <div className={`${homeStyles.setCard}${set.pinned ? ' ' + homeStyles.pinnedCard : ''}`} onClick={onNavigate}>
      <button className={`${homeStyles.pinBtn}${set.pinned ? ' ' + homeStyles.pinBtnActive : ''}`} onClick={(e) => { e.stopPropagation(); onPin() }} title={set.pinned ? 'Unpin' : 'Pin'}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill={set.pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5"><path d="M9 1L5 5H2l2 2-3 5 5-3 2 2V8l4-4z"/></svg>
      </button>
      <div className={homeStyles.setTitle}>{set.title}</div>
      {set.description && <div className={homeStyles.setDesc}>{set.description}</div>}
      {folder && <div className={homeStyles.folderBadge}><span className={homeStyles.folderDot} style={{ background: folder.color }} />{folder.name}</div>}
      <div className={homeStyles.setMeta}>
        <span className={homeStyles.setCount}>{set.cardCount ?? 0} cards</span>
        <Link to={`/sets/${set.id}/study`} className={homeStyles.studyBtn} onClick={(e) => e.stopPropagation()}>Study</Link>
      </div>
    </div>
  )
}
