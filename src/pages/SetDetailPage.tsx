import { useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useSetsStore } from '@/store/setsStore'
import styles from './SetDetailPage.module.css'

export default function SetDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { currentSet, fetchSet, deleteSet, isLoading } = useSetsStore()

  useEffect(() => { if (id) fetchSet(id) }, [id])

  const handleDelete = async () => {
    if (!currentSet) return
    if (!window.confirm(`Delete "${currentSet.title}"? This can't be undone.`)) return
    await deleteSet(currentSet.id)
    navigate('/')
  }

  if (isLoading && !currentSet) return <div className={styles.loading}>Loading…</div>
  if (!currentSet) return null

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{currentSet.title}</h1>
          {currentSet.description && <p className={styles.desc}>{currentSet.description}</p>}
          <p className={styles.meta}>{currentSet.cards?.length ?? 0} cards</p>
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
