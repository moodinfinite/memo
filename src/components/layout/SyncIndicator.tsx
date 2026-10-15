import { flushPending, useSyncStatus } from '@/lib/sync'
import styles from './SyncIndicator.module.css'

export default function SyncIndicator({ compact = false }: { compact?: boolean }) {
  const { pending, error, storageError } = useSyncStatus()
  const needsAttention = storageError || (!!error && pending > 0)
  if (!needsAttention) return null
  const label = storageError ? 'Save needs attention' : 'Saved on device'
  const detail = storageError ? 'Device storage is unavailable. Keep this tab open until syncing finishes.'
    : 'Progress is saved on this device. Click to retry syncing.'
  return <button className={[styles.indicator, needsAttention ? styles.warning : ''].join(' ')}
    title={detail} aria-label={`${label}. ${detail}`} onClick={() => { if (needsAttention) void flushPending() }}>
    <span className={styles.dot} aria-hidden="true" />
    {!compact && <span>{label}</span>}
  </button>
}
