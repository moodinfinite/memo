import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useSetsStore } from '@/store/setsStore'
import { useFoldersStore } from '@/store/foldersStore'
import { SetDetailSkeleton } from '@/components/ui/Skeleton'
import styles from './SetDetailPage.module.css'

export default function SetDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { currentSet, fetchSet, deleteSet, moveToFolder, isLoading } = useSetsStore()
  const { folders } = useFoldersStore()
  const [showFolderPicker, setShowFolderPicker] = useState(false)
  const folderPickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (folderPickerRef.current && !folderPickerRef.current.contains(e.target as Node)) setShowFolderPicker(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => { if (id) fetchSet(id) }, [id])

  const handleMoveToFolder = async (folderId: string | null) => {
    if (!currentSet) return
    await moveToFolder(currentSet.id, folderId)
    setShowFolderPicker(false)
  }

  const handleDelete = async () => {
    if (!currentSet) return
    if (!window.confirm(`Delete "${currentSet.title}"? This can't be undone.`)) return
    await deleteSet(currentSet.id)
    navigate('/')
  }

  if (isLoading && !currentSet) return <SetDetailSkeleton />
  if (!currentSet) return null

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{currentSet.title}</h1>
          {currentSet.description && <p className={styles.desc}>{currentSet.description}</p>}
          <p className={styles.meta}>{currentSet.cards?.length ?? 0} cards</p>
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
        </div>
      </div>

      <div className={styles.sectionLabel}>All cards</div>

      <div className={styles.cardList}>
        {(currentSet.cards ?? []).map((card, i) => (
          <div key={card.id} className={styles.cardRow}>
            <span className={styles.rowNum}>{i + 1}</span>
            <div className={styles.rowContent}>
              <div className={styles.term}>{card.term}</div>
              <div className={styles.divider} />
              <div className={styles.definition}>{card.definition}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
