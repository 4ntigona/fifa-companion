import { lazy, Suspense, useEffect, useState } from 'react'
import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom'
import { api } from './api/client'
import { AdminRoute, RequireAuth, useAuth, useClearAuth } from './auth'
const Login = lazy(() => import('./pages/Login'))
const AdminDatabases = lazy(() => import('./pages/admin/Databases'))
const AdminUsers = lazy(() => import('./pages/admin/Users'))
const Home = lazy(() => import('./pages/Home'))
const NewCareer = lazy(() => import('./pages/NewCareer'))
const CareerPage = lazy(() => import('./pages/Career'))
const ProspectsPage = lazy(() => import('./pages/Prospects'))
const PlayerPage = lazy(() => import('./pages/Player'))
const CapturePage = lazy(() => import('./pages/Capture'))
const SettingsPage = lazy(() => import('./pages/Settings'))

type ThemeMode = 'light' | 'dark' | 'system'

const THEME_ICON: Record<ThemeMode, string> = { light: '☀️', dark: '🌙', system: '🌗' }
const THEME_LABEL: Record<ThemeMode, string> = {
  light: 'Tema claro', dark: 'Tema escuro', system: 'Tema automático (segue o dispositivo)',
}

function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('theme')
    return saved === 'light' || saved === 'dark' ? saved : 'system'
  })

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = mode === 'dark' || (mode === 'system' && mq.matches)
      document.documentElement.classList.toggle('dark', dark)
    }
    apply()
    if (mode === 'system') {
      // segue mudanças do sistema em tempo real
      mq.addEventListener('change', apply)
      return () => mq.removeEventListener('change', apply)
    }
  }, [mode])

  const cycle = () =>
    setMode((m) => {
      const next: ThemeMode = m === 'system' ? 'light' : m === 'light' ? 'dark' : 'system'
      if (next === 'system') localStorage.removeItem('theme')
      else localStorage.setItem('theme', next)
      return next
    })

  return { mode, cycle }
}

export default function App() {
  const loc = useLocation()
  const nav = useNavigate()
  const { mode, cycle } = useTheme()
  const { user } = useAuth()
  const clearAuth = useClearAuth()

  async function logout() {
    try { await api('/api/auth/logout', { method: 'POST' }) } catch { /* melhor esforço */ }
    clearAuth()
    nav('/login', { replace: true })
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pb-24">
      <header className="flex items-center justify-between border-b border-hairline-soft py-4">
        <Link to="/" className="text-base font-semibold uppercase tracking-widest text-ink">
          Career <span className="text-primary">\</span> Companion
        </Link>
        <nav className="flex items-center gap-4 text-sm font-medium text-steel">
          {user && loc.pathname !== '/' && <Link to="/" className="hover:text-ink">Início</Link>}
          {user?.role === 'admin' && <Link to="/admin/databases" className="hover:text-ink">Admin</Link>}
          {user && <Link to="/config" title="Configurações" className="hover:text-ink">⚙️ Config</Link>}
          {user && (
            <button onClick={logout} title={`Sair (${user.email})`} className="hover:text-ink">
              Sair
            </button>
          )}
          <button
            onClick={cycle}
            title={`${THEME_LABEL[mode]} — clique para alternar`}
            aria-label={THEME_LABEL[mode]}
            className="border border-hairline px-2.5 py-1 text-sm transition-colors hover:border-hairline-strong"
          >
            {THEME_ICON[mode]}{mode === 'system' && <span className="ml-1 text-[11px] font-semibold uppercase tracking-wide">auto</span>}
          </button>
        </nav>
      </header>
      <Suspense fallback={<p className="pt-6 text-slate-ink">Carregando…</p>}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<RequireAuth><Home /></RequireAuth>} />
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
      <footer className="mt-12 border-t border-hairline pt-4 text-center text-[13px] text-steel">
        Dados originais do jogo via <a className="text-link underline" href="https://sofifa.com" target="_blank" rel="noreferrer">SoFIFA</a> (dumps públicos). Projeto pessoal, não comercial.
      </footer>
    </div>
  )
}
