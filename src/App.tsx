import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { useTheme } from '@/hooks/useTheme'
import AppLayout from '@/components/layout/AppLayout'
import HomePage from '@/pages/HomePage'
import LoginPage from '@/pages/LoginPage'
import SignupPage from '@/pages/SignupPage'
import NewSetPage from '@/pages/NewSetPage'
import EditSetPage from '@/pages/EditSetPage'
import StudyPage from '@/pages/StudyPage'
import SetDetailPage from '@/pages/SetDetailPage'
import FolderPage from '@/pages/FolderPage'
import MasterDeckPage from '@/pages/MasterDeckPage'
import '@/styles/globals.css'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, initialised } = useAuthStore()
  if (!initialised) return <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',color:'var(--text-tertiary)',fontSize:'14px' }}>Loading…</div>
  return user ? <>{children}</> : <Navigate to="/login" replace />
}
function RequireGuest({ children }: { children: React.ReactNode }) {
  const { user, initialised } = useAuthStore()
  if (!initialised) return null
  return !user ? <>{children}</> : <Navigate to="/" replace />
}

export default function App() {
  const { init } = useAuthStore()
  useTheme()
  useEffect(() => { init() }, [])
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<RequireGuest><LoginPage /></RequireGuest>} />
        <Route path="/signup" element={<RequireGuest><SignupPage /></RequireGuest>} />
        <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
          <Route path="/" element={<HomePage />} />
          <Route path="/sets" element={<HomePage />} />
          <Route path="/folders/:id" element={<FolderPage />} />
          <Route path="/sets/new" element={<NewSetPage />} />
          <Route path="/sets/:id" element={<SetDetailPage />} />
          <Route path="/sets/:id/edit" element={<EditSetPage />} />
          <Route path="/sets/:id/study" element={<StudyPage />} />
          <Route path="/master" element={<MasterDeckPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
