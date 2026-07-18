import { lazy, Suspense } from 'react'
import { Routes, Route, Link, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AdminRoute, RequireAuth, useAuth } from './auth'
import { listCareers } from './api/user-data'
import { getActiveCareerId } from './hooks'
import { versionLabel } from './api/client'
import TabBar from './components/TabBar'
const Login = lazy(() => import('./pages/Login'))
const AdminDatabases = lazy(() => import('./pages/admin/Databases'))
const AdminUsers = lazy(() => import('./pages/admin/Users'))
const Home = lazy(() => import('./pages/Home'))
const Mais = lazy(() => import('./pages/Mais'))
const NewCareer = lazy(() => import('./pages/NewCareer'))
const CareerPage = lazy(() => import('./pages/Career'))
const ProspectsPage = lazy(() => import('./pages/Prospects'))
const PlayerPage = lazy(() => import('./pages/Player'))
const CapturePage = lazy(() => import('./pages/Capture'))
const SettingsPage = lazy(() => import('./pages/Settings'))

/** Contexto da carreira ativa no header — nome + temporada quando estamos numa carreira. */
function HeaderContext() {
  const loc = useLocation()
  const fromPath = loc.pathname.match(/^\/carreira\/(\d+)/)?.[1]
  const activeId = fromPath != null ? Number(fromPath) : getActiveCareerId()
  const { data } = useQuery({ queryKey: ['careers'], queryFn: () => listCareers(), staleTime: 60_000 })
  const career = data?.careers.find((c) => c.id === activeId)
  if (!career) return null
  return (
    <span className="truncate text-[12px] font-medium text-steel">
      {career.name} · {versionLabel(career.fifa_version)} · {career.current_season}
    </span>
  )
}

export default function App() {
  const loc = useLocation()
  const { user } = useAuth()
  // O shell (header + tab bar) só aparece no app autenticado; login e troca forçada de
  // senha são telas cheias, sem moldura.
  const showShell = !!user && !user.mustChangePassword && loc.pathname !== '/login'

  return (
    <div className={showShell ? 'mx-auto max-w-3xl px-4 pb-28' : ''}>
      {showShell && (
        <header className="flex items-center justify-between gap-3 border-b border-hairline-soft py-3.5">
          <Link to="/mais" className="display shrink-0 text-[17px] italic text-ink">
            Prancheta<span className="text-pink">!</span>
          </Link>
          <HeaderContext />
        </header>
      )}
      <Suspense fallback={<p className="pt-6 text-slate-ink">Carregando…</p>}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<RequireAuth><Home /></RequireAuth>} />
          <Route path="/mais" element={<RequireAuth><Mais /></RequireAuth>} />
          <Route path="/nova-carreira" element={<RequireAuth><NewCareer /></RequireAuth>} />
          <Route path="/carreira/:id" element={<RequireAuth><CareerPage /></RequireAuth>} />
          <Route path="/carreira/:id/prospeccao" element={<RequireAuth><ProspectsPage /></RequireAuth>} />
          <Route path="/carreira/:id/captura" element={<RequireAuth><CapturePage /></RequireAuth>} />
          <Route path="/jogador/:id" element={<RequireAuth><PlayerPage /></RequireAuth>} />
          <Route path="/config" element={<RequireAuth><SettingsPage /></RequireAuth>} />
          <Route path="/admin/databases" element={<RequireAuth><AdminRoute><AdminDatabases /></AdminRoute></RequireAuth>} />
          <Route path="/admin/usuarios" element={<RequireAuth><AdminRoute><AdminUsers /></AdminRoute></RequireAuth>} />
        </Routes>
      </Suspense>
      {showShell && <TabBar />}
    </div>
  )
}
