import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { getActiveCareerId } from '../hooks'

/** Shell de navegação: tab bar fixa no rodapé, otimizada para o polegar (o app é usado no
 *  celular enquanto o FIFA roda na TV). Os 3 jobs de jogo — elenco / scout / captura — operam
 *  sobre a carreira ativa; "Mais" leva ao hub de conta/admin. Sem carreira ativa, as tabs de
 *  jogo ficam visíveis mas desabilitadas: ensinam a estrutura e apontam para o seletor. */

const ICON: Record<string, ReactNode> = {
  elenco: (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <path d="M6 4h10l2 4-3 1.5V18H7V9.5L4 8l2-4z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  ),
  scout: (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="6" stroke="currentColor" strokeWidth="1.8" />
      <path d="M14.5 14.5L19 19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
  captura: (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <rect x="3" y="6" width="16" height="12" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="11" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 6l1.2-2h3.6L14 6" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  ),
  mais: (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <circle cx="5" cy="11" r="1.8" fill="currentColor" />
      <circle cx="11" cy="11" r="1.8" fill="currentColor" />
      <circle cx="17" cy="11" r="1.8" fill="currentColor" />
    </svg>
  ),
}

export default function TabBar() {
  const loc = useLocation()
  // fonte síncrona: a própria URL quando estamos dentro de uma carreira;
  // fallback reativo: localStorage (atualizado pelas páginas via evento)
  const fromPath = loc.pathname.match(/^\/carreira\/(\d+)/)?.[1]
  const [stored, setStored] = useState(getActiveCareerId())
  useEffect(() => {
    const sync = () => setStored(getActiveCareerId())
    window.addEventListener('active-career-changed', sync)
    return () => window.removeEventListener('active-career-changed', sync)
  }, [])
  const activeId = fromPath != null ? Number(fromPath) : stored
  const base = activeId != null ? `/carreira/${activeId}` : null

  const tabs = [
    {
      key: 'elenco', label: 'Elenco',
      to: base, enabled: base != null,
      active: /^\/carreira\/\d+$/.test(loc.pathname) || loc.pathname.startsWith('/jogador/'),
    },
    {
      key: 'scout', label: 'Scout',
      to: base ? `${base}/prospeccao` : null, enabled: base != null,
      active: loc.pathname.includes('/prospeccao'),
    },
    {
      key: 'captura', label: 'Captura',
      to: base ? `${base}/captura` : null, enabled: base != null,
      active: loc.pathname.includes('/captura'),
    },
    {
      key: 'mais', label: 'Mais',
      to: '/mais', enabled: true,
      active: loc.pathname === '/mais' || loc.pathname === '/config' || loc.pathname.startsWith('/admin'),
    },
  ]

  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      <div className="mx-auto grid max-w-3xl grid-cols-4">
        {tabs.map((t) => {
          const cls = `flex min-h-[56px] flex-col items-center justify-center gap-1 pt-2 pb-1.5 text-[10.5px] font-bold uppercase tracking-[0.08em] ${
            t.active ? 'text-primary' : t.enabled ? 'text-faint hover:text-steel' : 'text-faint/50'
          }`
          const inner = (
            <>
              <span aria-hidden="true">{ICON[t.key]}</span>
              <span className={t.active ? 'display not-italic' : undefined}>{t.label}</span>
              <span className={`h-0.5 w-6 rounded-full ${t.active ? 'bg-primary' : 'bg-transparent'}`} />
            </>
          )
          return t.enabled && t.to ? (
            <Link key={t.key} to={t.to} aria-current={t.active ? 'page' : undefined} className={cls}>
              {inner}
            </Link>
          ) : (
            <span key={t.key} aria-disabled="true" title="Selecione uma carreira primeiro" className={cls}>
              {inner}
            </span>
          )
        })}
      </div>
    </nav>
  )
}
