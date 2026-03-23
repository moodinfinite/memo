import { useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useSetsStore } from '@/store/setsStore'
import { useFoldersStore } from '@/store/foldersStore'
import styles from './HomePage.module.css'

export default function FolderPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { sets, fetchSets, togglePin } = useSetsStore()
  const { folders, deleteFolder } = useFoldersStore()

  useEffect(() => { fetchSets() }, [])

  const folder = folders.find((f) => f.id === id)
  const folderSets = sets.filter((s) => s.folder_id === id)

  const handleDeleteFolder = async () => {
    if (!folder) return
    if (!window.confirm(`Delete folder "${folder.name}"? Sets inside will be moved out but not deleted.`)) return
    await deleteFolder(folder.id)
    navigate('/')
  }

  if (!folder) return <div className={styles.loading}>Loading…</div>

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: folder.color, display: 'inline-block' }} />
            <h1 className={styles.greeting}>{folder.name}</h1>
          </div>
          <p className={styles.sub}>{folderSets.length} set{folderSets.length === 1 ? '' : 's'}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link to="/sets/new" className={styles.newBtn}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6.5 1v11M1 6.5h11"/></svg>
            New set
          </Link>
          <button onClick={handleDeleteFolder} style={{ height: 36, padding: '0 14px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-tertiary)', fontSize: 13.5, fontFamily: 'var(--font)', cursor: 'pointer' }}>
            Delete folder
          </button>
        </div>
      </div>

      {folderSets.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyTitle}>No sets in this folder</div>
          <div className={styles.emptySub}>Create a set and assign it to this folder</div>
          <Link to="/sets/new" className={styles.emptyBtn}>Create a set</Link>
        </div>
      ) : (
        <>
          <div className={styles.sectionLabel}>Sets</div>
          <div className={styles.grid}>
            {folderSets.map((set) => (
              <div key={set.id} className={`${styles.setCard}${set.pinned ? ' ' + styles.pinned : ''}`} onClick={() => navigate(`/sets/${set.id}`)}>
                <button className={`${styles.pinBtn}${set.pinned ? ' ' + styles.pinBtnActive : ''}`}
                  onClick={(e) => { e.stopPropagation(); togglePin(set.id) }}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill={set.pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5"><path d="M9 1L5 5H2l2 2-3 5 5-3 2 2V8l4-4z"/></svg>
                </button>
                <div className={styles.setTitle}>{set.title}</div>
                {set.description && <div className={styles.setDesc}>{set.description}</div>}
                <div className={styles.setMeta}>
                  <span className={styles.setCount}>{set.cardCount ?? 0} cards</span>
                  <Link to={`/sets/${set.id}/study`} className={styles.studyBtn} onClick={(e) => e.stopPropagation()}>Study</Link>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
