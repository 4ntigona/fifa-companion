import { lazy, Suspense, useEffect, useState } from 'react'
import { Routes, Route, Link, useLocation } from 'react-router-dom'
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
  const { mode, cycle } = useTheme()
  return (
    <div className="mx-auto max-w-3xl px-4 pb-24">
      <header className="flex items-center justify-between border-b border-hairline-soft py-4">
        <Link to="/" className="text-base font-semibold uppercase tracking-widest text-ink">
          Career <span className="text-primary">\</span> Companion
        </Link>
        <nav className="flex items-center gap-4 text-sm font-medium text-steel">
          {loc.pathname !== '/' && <Link to="/" className="hover:text-ink">Início</Link>}
          <Link to="/config" title="Configurações" className="hover:text-ink">⚙️ Config</Link>
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
          <Route path="/" element={<Home />} />
          <Route path="/nova-carreira" element={<NewCareer />} />
          <Route path="/carreira/:id" element={<CareerPage />} />
          <Route path="/carreira/:id/prospeccao" element={<ProspectsPage />} />
          <Route path="/carreira/:id/captura" element={<CapturePage />} />
          <Route path="/jogador/:id" element={<PlayerPage />} />
          <Route path="/config" element={<SettingsPage />} />
        </Routes>
      </Suspense>
      <footer className="mt-12 border-t border-hairline pt-4 text-center text-[13px] text-steel">
        Dados originais do jogo via <a className="text-link underline" href="https://sofifa.com" target="_blank" rel="noreferrer">SoFIFA</a> (dumps públicos). Projeto pessoal, não comercial.
      </footer>
    </div>
  )
}
