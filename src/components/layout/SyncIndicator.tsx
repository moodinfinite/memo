import { useEffect, useState } from 'react'
import { flushPending, useSyncStatus } from '@/lib/sync'
import styles from './SyncIndicator.module.css'

export default function SyncIndicator({ compact = false }: { compact?: boolean }) {
  const { pending, error, storageError } = useSyncStatus()
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    if (!pending) { setSlow(false); return }
    const timeout = setTimeout(() => setSlow(true), 2000)
    return () => clearTimeout(timeout)
  }, [pending > 0])
  const needsAttention = storageError || (!!error && pending > 0)
  const label = storageError ? 'Save needs attention' : needsAttention ? 'Saved on device' : slow && pending ? 'Syncing…' : 'Autosave on'
  const detail = storageError ? 'Device storage is unavailable. Keep this tab open until syncing finishes.'
    : needsAttention ? 'Progress is saved on this device. Click to retry syncing.'
    : pending ? 'Progress is saved on this device and syncing automatically.' : 'All progress is synced.'
  return <button className={[styles.indicator, needsAttention ? styles.warning : ''].join(' ')}
    title={detail} aria-label={`${label}. ${detail}`} onClick={() => { if (needsAttention) void flushPending() }}>
    <span className={styles.dot} aria-hidden="true" />
    {!compact && <span>{label}</span>}
  </button>
}
