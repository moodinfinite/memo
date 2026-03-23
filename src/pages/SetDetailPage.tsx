import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useSetsStore } from '@/store/setsStore'
import ImportModal from '@/components/ui/ImportModal'
import styles from './SetDetailPage.module.css'

export default function SetDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { currentSet, fetchSet, deleteSet, isLoading } = useSetsStore()
  const [showImport, setShowImport] = useState(false)
  const [importSuccess, setImportSuccess] = useState<number | null>(null)

  useEffect(() => { if (id) fetchSet(id) }, [id])

  const handleDelete = async () => {
    if (!currentSet) return
    if (!window.confirm(`Delete "${currentSet.title}"? This can't be undone.`)) return
    await deleteSet(currentSet.id)
    navigate('/')
  }

  const handleImportSuccess = (count: number) => {
    setImportSuccess(count)
    setTimeout(() => setImportSuccess(null), 3000)
  }

  if (isLoading || !currentSet) return <div className={styles.loading}>Loading…</div>

  return (
    <div className={styles.page}>
      {showImport && id && (
        <ImportModal
          setId={id}
          onClose={() => setShowImport(false)}
          onSuccess={handleImportSuccess}
        />
      )}

      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{currentSet.title}</h1>
          {currentSet.description && <p className={styles.desc}>{currentSet.description}</p>}
          <p className={styles.meta}>{currentSet.cards?.length ?? 0} cards</p>
        </div>
        <div className={styles.actions}>
          <Link to={`/sets/${id}/study`} className={styles.studyBtn}>Study</Link>
          <button className={styles.importBtn} onClick={() => setShowImport(true)}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M7 1v8M4 6l3 3 3-3M2 11h10"/>
            </svg>
            Import
          </button>
          <Link to={`/sets/${id}/edit`} className={styles.editBtn}>Edit</Link>
          <button className={styles.deleteBtn} onClick={handleDelete}>Delete</button>
        </div>
      </div>

      {importSuccess && (
        <div className={styles.successBanner}>
          {importSuccess} card{importSuccess === 1 ? '' : 's'} imported successfully
        </div>
      )}

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
