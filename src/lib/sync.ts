import { create } from 'zustand'
import { supabase } from './supabase'

export interface PendingWrite {
  userId: string
  key: string
  version: string
  table: 'card_srs' | 'study_sessions' | 'session_drafts'
  operation: 'upsert' | 'delete'
  data?: Record<string, unknown>
  conflict?: string
  filters?: Record<string, string>
}

export const useSyncStatus = create<{ pending: number; syncing: boolean; error: string | null; storageError: boolean }>(() => ({
  pending: 0, syncing: false, error: null, storageError: false,
}))

// Separate, user-scoped keys prevent one account's retries being sent as another.
const syncedListeners = new Set<(job: PendingWrite) => void>()
export function onSynced(listener: (job: PendingWrite) => void) { syncedListeners.add(listener) }
const memory = new Map<string, string>()
let activeUser: string | null = null
let running: Promise<void> | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null
let controller: AbortController | null = null

export function readLocal<T>(key: string): T | null {
  try { const value = memory.get(key) ?? localStorage.getItem(key); return value ? JSON.parse(value) : null }
  catch { return null }
}
export function writeLocal(key: string, value: unknown) {
  const json = JSON.stringify(value)
  try { localStorage.setItem(key, json); memory.delete(key) }
  catch {
    memory.set(key, json)
    useSyncStatus.setState({ storageError: true })
  }
}
function removeLocal(key: string) {
  memory.delete(key)
  try { localStorage.removeItem(key) } catch { useSyncStatus.setState({ storageError: true }) }
}
function storageKey(userId: string, key: string) { return `memo:pending:${userId}:${key}` }
export function pendingWrites(userId: string): PendingWrite[] {
  const keys = new Set(memory.keys())
  try { for (let i = 0; i < localStorage.length; i++) keys.add(localStorage.key(i)!) } catch { /* memory fallback */ }
  return [...keys].filter(k => k.startsWith(`memo:pending:${userId}:`))
    .map(k => readLocal<PendingWrite>(k)).filter((v): v is PendingWrite => !!v)
}
function updateCount() { useSyncStatus.setState({ pending: activeUser ? pendingWrites(activeUser).length : 0 }) }
export function activateSync(userId: string | null) {
  if (activeUser !== userId) { controller?.abort(); activeUser = userId; useSyncStatus.setState({ error: null }) }
  updateCount()
  if (retryTimer) clearTimeout(retryTimer)
  retryTimer = null
  if (userId) void flushPending()
}
export function queueWrite(write: Omit<PendingWrite, 'version'>) {
  writeLocal(storageKey(write.userId, write.key), { ...write, version: crypto.randomUUID() })
  updateCount()
  // The durable record exists before any request starts; coalesce rapid changes.
  if (!retryTimer) retryTimer = setTimeout(() => { retryTimer = null; void flushPending() }, 500)
}
export function discardPending(userId: string, key: string) { removeLocal(storageKey(userId, key)); updateCount() }
export function hasPending(userId: string, key: string) { return !!readLocal(storageKey(userId, key)) }

export async function flushPending(): Promise<void> {
  if (running) { await running; if (activeUser && pendingWrites(activeUser).length && !useSyncStatus.getState().error) return flushPending(); return }
  const userId = activeUser
  if (!userId) return
  running = (async () => {
    useSyncStatus.setState({ syncing: true, error: null })
    for (const job of pendingWrites(userId)) {
      if (activeUser !== userId) break
      // A newer coalesced write may have replaced this one while earlier jobs ran.
      const key = storageKey(userId, job.key)
      if (readLocal<PendingWrite>(key)?.version !== job.version) continue
      controller = new AbortController()
      const requestController = controller
      const deadline = setTimeout(() => requestController.abort(), 15000)
      try {
        let request: any = supabase.from(job.table)
        if (job.operation === 'upsert') request = request.upsert(job.data, { onConflict: job.conflict })
        else {
          request = request.delete()
          for (const [field, value] of Object.entries(job.filters ?? {})) request = request.eq(field, value)
        }
        const { error } = await request.abortSignal(requestController.signal)
        if (requestController.signal.aborted) throw new Error('Connection timed out')
        if (error) throw error
        if (readLocal<PendingWrite>(key)?.version === job.version) removeLocal(key)
        if (activeUser === userId) for (const listener of syncedListeners) listener(job)
      } catch (error: any) {
        if (activeUser === userId) useSyncStatus.setState({ error: `Progress is waiting to sync: ${error?.message ?? 'connection unavailable'}` })
        // Keep failed writes durable. Other records can still make progress.
      } finally { clearTimeout(deadline) }
    }
  })().finally(() => {
    running = null
    controller = null
    useSyncStatus.setState({ syncing: false })
    updateCount()
    if (activeUser && pendingWrites(activeUser).length && !retryTimer) {
      retryTimer = setTimeout(() => { retryTimer = null; void flushPending() }, 10000)
    }
  })
  await running
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { void flushPending() })
  window.addEventListener('focus', () => { void flushPending() })
}
