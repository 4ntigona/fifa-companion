import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type ThemeMode = 'light' | 'dark' | 'system'

export const THEME_LABEL: Record<ThemeMode, string> = {
  light: 'Tema claro',
  dark: 'Tema escuro',
  system: 'Automático (segue o dispositivo)',
}

interface ThemeState {
  mode: ThemeMode
  /** claro → escuro → automático → claro… */
  cycle: () => void
}

const ThemeContext = createContext<ThemeState>({ mode: 'system', cycle: () => {} })

/** Provider único: aplica a classe `.dark` (uma vez, no topo da árvore) e expõe o controle
 *  para quem quiser — hoje a tela "Mais". Manter um só provider evita duas instâncias
 *  escrevendo no localStorage e brigando pela classe. */
export function ThemeProvider({ children }: { children: ReactNode }) {
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

  return <ThemeContext.Provider value={{ mode, cycle }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  return useContext(ThemeContext)
}
