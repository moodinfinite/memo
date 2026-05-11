import { useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { useTheme } from '@/hooks/useTheme'
import AppLayout from '@/components/layout/AppLayout'
import HomePage from '@/pages/HomePage'
import LoginPage from '@/pages/LoginPage'
import SignupPage from '@/pages/SignupPage'
import { FullPageSkeleton } from '@/components/ui/Skeleton'
import '@/styles/globals.css'

// Lazy-load heavy pages so they're only downloaded when first visited
const NewSetPage     = lazy(() => import('@/pages/NewSetPage'))
const EditSetPage    = lazy(() => import('@/pages/EditSetPage'))
const StudyPage      = lazy(() => import('@/pages/StudyPage'))
const SetDetailPage  = lazy(() => import('@/pages/SetDetailPage'))
const FolderPage     = lazy(() => import('@/pages/FolderPage'))
const MasterDeckPage = lazy(() => import('@/pages/MasterDeckPage'))
const AllSetsPage    = lazy(() => import('@/pages/AllSetsPage'))

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, initialised } = useAuthStore()
  if (!initialised) return <FullPageSkeleton />
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
          <Route path="/sets" element={<Suspense fallback={<FullPageSkeleton />}><AllSetsPage /></Suspense>} />
          <Route path="/folders/:id" element={<Suspense fallback={<FullPageSkeleton />}><FolderPage /></Suspense>} />
          <Route path="/sets/new" element={<Suspense fallback={<FullPageSkeleton />}><NewSetPage /></Suspense>} />
          <Route path="/sets/:id" element={<Suspense fallback={<FullPageSkeleton />}><SetDetailPage /></Suspense>} />
          <Route path="/sets/:id/edit" element={<Suspense fallback={<FullPageSkeleton />}><EditSetPage /></Suspense>} />
          <Route path="/sets/:id/study" element={<Suspense fallback={<FullPageSkeleton />}><StudyPage /></Suspense>} />
          <Route path="/master" element={<Suspense fallback={<FullPageSkeleton />}><MasterDeckPage /></Suspense>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
