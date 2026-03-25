import { useEffect, useState, useCallback } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { useTheme } from '@/hooks/useTheme'
import { useFoldersStore } from '@/store/foldersStore'
import styles from './AppLayout.module.css'

export default function AppLayout() {
  const { user, profile, logout } = useAuthStore()
  const { toggle, isDark } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const { folders, fetchFolders, createFolder } = useFoldersStore()
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => { fetchFolders() }, [])

  // Close sidebar on navigation (mobile)
  useEffect(() => { setMobileOpen(false) }, [location.pathname])

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
        <button className={styles.hamburger} onClick={() => setMobileOpen(true)} aria-label="Open menu">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 5h14M3 10h14M3 15h14"/></svg>
        </button>
        <div className={styles.mobileTitle}>Memo</div>
        <button className={styles.mobileThemeBtn} onClick={toggle}>
          {isDark
            ? <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="3"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.2 3.2l1.4 1.4M11.4 11.4l1.4 1.4M3.2 12.8l1.4-1.4M11.4 4.6l1.4-1.4"/></svg>
            : <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M13.5 10A6 6 0 0 1 6 2.5a6 6 0 1 0 7.5 7.5Z"/></svg>
          }
        </button>
      </header>

      {/* Backdrop for mobile sidebar */}
      {mobileOpen && <div className={styles.backdrop} onClick={closeSidebar} />}

      <aside className={[styles.sidebar, mobileOpen ? styles.sidebarOpen : ''].join(' ')}>
        <div className={styles.sidebarTop}>
          <div className={styles.logo}>Memo</div>
          <button className={styles.closeBtn} onClick={closeSidebar} aria-label="Close menu">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 4l10 10M14 4L4 14"/></svg>
          </button>
        </div>
        <nav className={styles.nav}>
          <NavLink to="/" end className={({ isActive }) => [styles.navItem, isActive ? styles.active : ''].join(' ')}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/></svg>
            <span>Home</span>
          </NavLink>
          <NavLink to="/sets" className={({ isActive }) => [styles.navItem, isActive ? styles.active : ''].join(' ')}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 4h12M2 8h8M2 12h10"/></svg>
            <span>All sets</span>
          </NavLink>
          <NavLink to="/master" className={({ isActive }) => [styles.navItem, isActive ? styles.active : ''].join(' ')}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="4" width="12" height="9" rx="1.5"/><path d="M5 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1M5 8h6M5 11h4"/></svg>
            <span>Master Deck</span>
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
          <button className={styles.footerBtn} onClick={toggle}>
            {isDark
              ? <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="3"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.2 3.2l1.4 1.4M11.4 11.4l1.4 1.4M3.2 12.8l1.4-1.4M11.4 4.6l1.4-1.4"/></svg>
              : <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M13.5 10A6 6 0 0 1 6 2.5a6 6 0 1 0 7.5 7.5Z"/></svg>
            }
          </button>
          <div className={styles.userInfo}>
            <div className={styles.userName}>{profile?.name ?? user?.email}</div>
            <button className={styles.logoutBtn} onClick={logout}>Sign out</button>
          </div>
        </div>
      </aside>
      <main className={styles.main}><Outlet /></main>
    </div>
  )
}
