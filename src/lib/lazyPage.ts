import { lazy, type ComponentType } from 'react'

/**
 * Each deploy renames the code files a page loads on demand. A tab opened before the deploy still asks
 * for the old names, which no longer exist, so the import fails and the page would go blank. These
 * helpers spot that and reload once to pick up the new build.
 */
const RELOADED_AT = 'memo-new-build-reload'

export function isStaleBuildError(err: unknown) {
  const message = String((err as { message?: unknown })?.message ?? err)
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported|valid JavaScript MIME type|Unable to preload CSS|ChunkLoadError/i.test(message)
}

/** Reload to fetch the new build, at most once every 30 s so a real outage can't loop. True if reloading. */
export function reloadForNewBuild(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOADED_AT) || 0)
    if (Date.now() - last < 30_000) return false
    sessionStorage.setItem(RELOADED_AT, String(Date.now()))
  } catch { /* no session storage: still worth one reload */ }
  window.location.reload()
  return true
}

/** `React.lazy` that reloads into the new build instead of failing when a deploy has renamed the file */
export function lazyPage<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  return lazy(() => load().catch(err => {
    if (isStaleBuildError(err) && reloadForNewBuild()) return new Promise<{ default: T }>(() => {})
    throw err
  }))
}
