import { Component, type ReactNode } from 'react'
import { isStaleBuildError, reloadForNewBuild } from '@/lib/lazyPage'
import styles from './PageErrorBoundary.module.css'

interface State { error: Error | null }

/**
 * Catches a page that crashes, so the sidebar stays and there's a way back instead of a blank screen.
 * A page that failed because a deploy renamed its files reloads into the new build.
 */
export default class PageErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State { return { error } }

  componentDidCatch(error: Error) {
    if (isStaleBuildError(error)) reloadForNewBuild()
    else console.error('Page crashed:', error)
  }

  render() {
    if (!this.state.error) return this.props.children
    const stale = isStaleBuildError(this.state.error)
    return (
      <div className={styles.wrap} role="alert">
        <p className={styles.title}>{stale ? 'Memo was just updated' : 'Something went wrong on this page'}</p>
        <p className={styles.text}>{stale ? 'Reload to get the new version. Your progress is saved.' : 'Your progress is saved. Reloading usually fixes it.'}</p>
        <div className={styles.row}>
          <button type="button" className={styles.primary} onClick={() => window.location.reload()}>Reload</button>
          <a href="/" className={styles.ghost}>Go home</a>
        </div>
      </div>
    )
  }
}
