import { useSyncStatus } from '@/lib/sync'
import SyncIndicator from './SyncIndicator'
import ProfileStats from './ProfileStats'
import { useEffect, useState, useCallback } from 'react'
import { Outlet, Link, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { useTheme } from '@/hooks/useTheme'
import { useFoldersStore } from '@/store/foldersStore'
import { currentResults, isLevelCheckDue, levelHistory, levelName } from '@/lib/levelTest'
import PageErrorBoundary from '@/components/ui/PageErrorBoundary'
import styles from './AppLayout.module.css'

export default function AppLayout() {
  const sync = useSyncStatus()
  const { user, profile, logout } = useAuthStore()
  const { toggle, isDark } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const { folders, fetchFolders, createFolder } = useFoldersStore()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)
  const displayName = profile?.name ?? user?.email ?? ''
  const levels = levelHistory(user?.user_metadata)
  const latestLevel = currentResults(levels)[0]
  const levelDue = isLevelCheckDue(levels)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebarCollapsed') === 'true')

  const toggleCollapsed = () => setCollapsed(v => {
    localStorage.setItem('sidebarCollapsed', String(!v))
    return !v
  })

  useEffect(() => { fetchFolders() }, [])

  // Close sidebar on navigation (mobile)
  useEffect(() => { setMobileOpen(false); setStatsOpen(false) }, [location.pathname])

  const handleNewFolder = async () => {
    const name = window.prompt('Folder name:')
    if (!name?.trim()) return
    await createFolder(name.trim())
  }

  const closeSidebar = useCallback(() => setMobileOpen(false), [])

  return (
    <div className={styles.shell}>
      {/* Mobile top bar */}
      <header className={styles.mobileHeader}>
        <button className={styles.hamburger} onClick={() => setMobileOpen(true)} aria-label={levelDue ? 'Open menu (level check due)' : 'Open menu'}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 5h14M3 10h14M3 15h14"/></svg>
          {levelDue && <span className={styles.nudge} />}
        </button>
        <Link to="/" className={styles.mobileTitle}>Memo</Link><SyncIndicator />
        <button className={styles.mobileThemeBtn} onClick={toggle}>
          {isDark
            ? <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="3"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.2 3.2l1.4 1.4M11.4 11.4l1.4 1.4M3.2 12.8l1.4-1.4M11.4 4.6l1.4-1.4"/></svg>
            : <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M13.5 10A6 6 0 0 1 6 2.5a6 6 0 1 0 7.5 7.5Z"/></svg>
          }
        </button>
      </header>

      {/* Backdrop for mobile sidebar */}
      {mobileOpen && <div className={styles.backdrop} onClick={closeSidebar} />}

      <aside className={[styles.sidebar, mobileOpen ? styles.sidebarOpen : '', collapsed ? styles.sidebarCollapsed : ''].join(' ')}>
        <div className={styles.sidebarTop}>
          <div><Link to="/" className={styles.logo} title="Home">Memo</Link><SyncIndicator compact={collapsed} /></div>
          <button className={styles.closeBtn} onClick={closeSidebar} aria-label="Close menu">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 4l10 10M14 4L4 14"/></svg>
          </button>
        </div>
        <nav className={styles.nav}>
          <NavLink to="/" end className={({ isActive }) => [styles.navItem, isActive ? styles.active : ''].join(' ')}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2.5 7.2L8 2.5l5.5 4.7" strokeLinecap="round" strokeLinejoin="round"/><path d="M3.8 6.3V13.5h8.4V6.3" strokeLinejoin="round"/><path d="M6.6 13.5V9.8h2.8v3.7" strokeLinejoin="round"/></svg>
            <span>Home</span>
          </NavLink>
          <NavLink to="/sets" className={({ isActive }) => [styles.navItem, isActive ? styles.active : ''].join(' ')}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 4h12M2 8h8M2 12h10"/></svg>
            <span>All sets</span>
          </NavLink>
          <NavLink to="/path" className={({ isActive }) => [styles.navItem, isActive ? styles.active : ''].join(' ')}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="4" cy="12" r="1.8"/><circle cx="12" cy="4" r="1.8"/><path d="M5.5 11C8 10 6 6 10.5 5"/></svg>
            <span>Path</span>
          </NavLink>
          <NavLink to="/level" className={({ isActive }) => [styles.navItem, isActive ? styles.active : ''].join(' ')}
            title={levelDue ? 'Level check due' : latestLevel ? `TOCFL ${levelName(latestLevel.level)}` : 'Level check'}>
            <span className={styles.navIcon}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 14h12M4 14V9M8 14V5M12 14V2"/></svg>
              {levelDue && <span className={styles.nudge} aria-label="Due" />}
            </span>
            <span>Level check</span>
            {latestLevel && <span className={styles.levelBadge}>{latestLevel.level === 0 ? 'Novice' : `L${latestLevel.level}`}</span>}
          </NavLink>
          <NavLink to="/resources" title="Resource library" aria-label="Resource library"
            className={({ isActive }) => [styles.navItem, isActive ? styles.active : ''].join(' ')}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <path d="M3 2.5h8a1 1 0 0 1 1 1V14l-4.5-3L3 14z"/>
            </svg>
            <span>Resource library</span>
          </NavLink>
        </nav>

        {folders.length > 0 && (
          <>
            <div className={styles.navSection}>Folders</div>
            <nav className={styles.nav}>
              {folders.map((f) => (
                <NavLink key={f.id} to={`/folders/${f.id}`}
                  className={({ isActive }) => [styles.folderItem, isActive ? styles.active : ''].join(' ')}>
                  <span className={styles.folderDot} style={{ background: f.color }} />
                  <span>{f.name}</span>
                </NavLink>
              ))}
            </nav>
          </>
        )}

        <div className={styles.navDivider} />
        <nav className={styles.nav}>
          <button className={styles.navItem} onClick={() => navigate('/sets/new')}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 2v12M2 8h12"/></svg>
            <span>New set</span>
          </button>
          <button className={styles.navItem} onClick={handleNewFolder}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 4h4l2 2h6v7H2z"/><path d="M8 8v4M6 10h4"/></svg>
            <span>New folder</span>
          </button>
        </nav>

        <div className={styles.spacer} />
        <div className={styles.footer}>
          <button className={styles.collapseBtn} onClick={toggleCollapsed} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{ transition: 'transform 0.2s', transform: collapsed ? 'rotate(180deg)' : 'none' }}>
              <path d="M9 3L5 7.5 9 12"/>
            </svg>
          </button>
          <button className={[styles.footerBtn, styles.footerBtnHide].join(' ')} onClick={toggle}>
            {isDark
              ? <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="3"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.2 3.2l1.4 1.4M11.4 11.4l1.4 1.4M3.2 12.8l1.4-1.4M11.4 4.6l1.4-1.4"/></svg>
              : <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M13.5 10A6 6 0 0 1 6 2.5a6 6 0 1 0 7.5 7.5Z"/></svg>
            }
          </button>
          <button className={styles.avatarBtn} onClick={() => setStatsOpen(true)} aria-haspopup="dialog" title="Your stats">
            {displayName.slice(0, 1).toUpperCase()}
          </button>
          <div className={styles.userInfo}>
            <button className={styles.userName} onClick={() => setStatsOpen(true)} aria-haspopup="dialog">{displayName}</button>
            <button className={styles.logoutBtn} onClick={logout}>Sign out</button>
          </div>
        </div>
      </aside>
      {statsOpen && <ProfileStats name={displayName} collapsed={collapsed} onClose={() => setStatsOpen(false)} />}
      <main className={styles.main}>
        {sync.storageError && <div role="alert" className={styles.storageWarning}>Device storage is unavailable. Keep this tab open until progress finishes syncing.</div>}
        <div className={styles.mainInner}><PageErrorBoundary key={location.pathname}><Outlet key={user?.id} /></PageErrorBoundary></div>
      </main>
    </div>
  )
}
