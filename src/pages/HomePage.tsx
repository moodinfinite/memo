import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { useSetsStore } from '@/store/setsStore'
import { useFoldersStore } from '@/store/foldersStore'
import { useProgressStore } from '@/store/progressStore'
import { useSRSStore } from '@/store/srsStore'
import { getSetMastery, MASTERY_INFO } from '@/lib/mastery'
import type { FlashcardSet } from '@/lib/database.types'
import { HomePageSkeleton } from '@/components/ui/Skeleton'
import styles from './HomePage.module.css'

export default function HomePage() {
  const { user, profile } = useAuthStore()
  const { sets, fetchSets, searchSets, togglePin, isLoading } = useSetsStore()
  const { folders } = useFoldersStore()
  const { weekStreak, totalCardsStudied, fetchProgress } = useProgressStore()
  const { cardSRS, fetchAllSRS } = useSRSStore()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')

  useEffect(() => { fetchSets(); fetchProgress(); fetchAllSRS() }, [])

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setQuery(val)
    if (val.trim()) searchSets(val.trim()); else fetchSets()
  }

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const firstName = profile?.name?.split(' ')[0] ?? user?.email?.split('@')[0] ?? 'there'
  const pinned = sets.filter((s) => s.pinned)
  const rest = sets.filter((s) => !s.pinned)
  const totalCards = sets.reduce((a, s) => a + (s.cardCount ?? 0), 0)

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.greeting}>{greeting}, {firstName}</h1>
          <p className={styles.sub}>{sets.length === 0 && !query ? 'Create your first set to get started' : `${sets.length} set${sets.length === 1 ? '' : 's'} · ${totalCards} cards`}</p>
        </div>
        <Link to="/sets/new" className={styles.newBtn}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6.5 1v11M1 6.5h11"/></svg>
          New set
        </Link>
      </div>

      <div className={styles.statsRow}>
        <div className={styles.statCard}><div className={styles.statLabel}>Study streak</div><div className={styles.statValue}>{weekStreak} {weekStreak === 1 ? 'week' : 'weeks'}</div><div className={styles.statSub}>consecutive weeks</div></div>
        <div className={styles.statCard}><div className={styles.statLabel}>Cards studied total</div><div className={styles.statValue}>{totalCardsStudied.toLocaleString()}</div><div className={styles.statSub}>across all sessions</div></div>
        <div className={styles.statCard}><div className={styles.statLabel}>Sets created</div><div className={styles.statValue}>{sets.length}</div><div className={styles.statSub}>{totalCards} cards total</div></div>
      </div>

      <div className={styles.searchWrap}>
        <svg className={styles.searchIcon} width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="6.5" cy="6.5" r="4.5"/><path d="M10.5 10.5l3 3"/></svg>
        <input className={styles.searchInput} type="text" value={query} onChange={handleSearch} placeholder="Search your sets…"/>
        {query && <button className={styles.searchClear} onClick={() => { setQuery(''); fetchSets() }}><svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M1 1l11 11M12 1L1 12"/></svg></button>}
      </div>

      {isLoading && <HomePageSkeleton />}

      {!isLoading && sets.length === 0 && !query && (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}><svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="5" width="22" height="18" rx="3"/><path d="M9 11h10M9 16h7"/></svg></div>
          <div className={styles.emptyTitle}>No sets yet</div>
          <div className={styles.emptySub}>Create a set to start studying</div>
          <Link to="/sets/new" className={styles.emptyBtn}>Create your first set</Link>
        </div>
      )}

      {!isLoading && sets.length === 0 && query && (
        <div className={styles.empty}><div className={styles.emptyTitle}>No sets match "{query}"</div><div className={styles.emptySub}>Try a different search term</div></div>
      )}

      {!isLoading && pinned.length > 0 && !query && (
        <><div className={styles.sectionLabel}>Pinned</div><div className={styles.grid}>{pinned.map((s) => <SetCard key={s.id} set={s} folders={folders} cardSRS={cardSRS} onPin={() => togglePin(s.id)} onNavigate={() => navigate(`/sets/${s.id}`)} />)}</div></>
      )}

      {!isLoading && rest.length > 0 && (
        <><div className={styles.sectionLabel}>{pinned.length > 0 && !query ? 'Other sets' : query ? `Results for "${query}"` : 'Your sets'}</div><div className={styles.grid}>{rest.map((s) => <SetCard key={s.id} set={s} folders={folders} cardSRS={cardSRS} onPin={() => togglePin(s.id)} onNavigate={() => navigate(`/sets/${s.id}`)} />)}</div></>
      )}
    </div>
  )
}

function SetCard({ set, folders, cardSRS, onPin, onNavigate }: {
  set: FlashcardSet
  folders: { id: string; name: string; color: string }[]
  cardSRS: Record<string, import('@/store/srsStore').CardSRS>
  onPin: () => void
  onNavigate: () => void
}) {
  const folder = folders.find((f) => f.id === set.folder_id)
  const cardCount = set.cardCount ?? 0
  const mastery = getSetMastery(set.id, cardCount, cardSRS)
  const info = MASTERY_INFO[mastery.level]
  return (
    <div className={`${styles.setCard}${set.pinned ? ' ' + styles.pinnedCard : ''}`} onClick={onNavigate}>
      <button className={`${styles.pinBtn}${set.pinned ? ' ' + styles.pinBtnActive : ''}`} onClick={(e) => { e.stopPropagation(); onPin() }} title={set.pinned ? 'Unpin' : 'Pin'}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill={set.pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5"><path d="M9 1L5 5H2l2 2-3 5 5-3 2 2V8l4-4z"/></svg>
      </button>
      <div className={styles.setTitle}>{set.title}</div>
      {set.description && <div className={styles.setDesc}>{set.description}</div>}
      {folder && <div className={styles.folderBadge}><span className={styles.folderDot} style={{ background: folder.color }} />{folder.name}</div>}
      {mastery.pct > 0 && (
        <div className={styles.masteryRow}>
          <span className={styles.masteryLabel} style={{ color: info.color }}>{info.label}</span>
          <div className={styles.masteryBarTrack}>
            <div className={styles.masteryBarFill} style={{ width: `${mastery.pct}%`, background: info.color }} />
          </div>
          <span className={styles.masteryPct}>{mastery.pct}%</span>
        </div>
      )}
      <div className={styles.setMeta}>
        <span className={styles.setCount}>{cardCount} cards</span>
        <Link to={`/sets/${set.id}/study`} className={styles.studyBtn} onClick={(e) => e.stopPropagation()}>Study</Link>
      </div>
    </div>
  )
}
