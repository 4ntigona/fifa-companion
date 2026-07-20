import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { api, versionLabel } from '../api/client'
import { listCareers } from '../api/user-data'
import { useAuth, useClearAuth } from '../auth'
import { useTheme, THEME_LABEL } from '../theme'
import { getActiveCareerId, setActiveCareerId } from '../hooks'

/** Tab "Mais": o hub de tudo que não é jogar a carreira — trocar/criar carreira, conta,
 *  administração (só admin), tema e sair. A Home (seletor de carreiras) se dissolve aqui. */
export default function Mais() {
  const nav = useNavigate()
  const { user } = useAuth()
  const clearAuth = useClearAuth()
  const { mode, cycle } = useTheme()

  const { data } = useQuery({ queryKey: ['careers'], queryFn: () => listCareers() })
  const careers = data?.careers ?? []
  const activeId = getActiveCareerId()

  function openCareer(id: number) {
    setActiveCareerId(id)
    nav(`/carreira/${id}`)
  }

  async function logout() {
    try { await api('/api/auth/logout', { method: 'POST' }) } catch { /* melhor esforço */ }
    clearAuth()
    nav('/login', { replace: true })
  }

  return (
    <div className="space-y-6 pt-5">
      <SectionTitle>Minhas carreiras</SectionTitle>
      {careers.length === 0 ? (
        <p className="card p-5 text-sm text-slate-ink">
          Nenhuma carreira ainda. Crie a primeira para começar a acompanhar o desenvolvimento do time.
        </p>
      ) : (
        <ul className="space-y-2">
          {careers.map((c) => {
            const active = c.id === activeId
            return (
              <li key={c.id}>
                <button
                  onClick={() => openCareer(c.id)}
                  className={`card flex w-full items-center gap-3 p-3.5 text-left ${
                    active ? 'border-primary ring-1 ring-primary' : 'hover:border-hairline-strong'
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold text-ink">{c.name}</span>
                    <span className="block truncate text-[12.5px] text-steel">
                      {versionLabel(c.fifa_version)} · {c.playerCount ?? 0} jogadores · {c.current_season}
                    </span>
                  </span>
                  {active && <span className="tag-purple">ativa</span>}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <Link to="/nova-carreira" className="btn-primary block w-full py-3 text-center">+ Nova carreira</Link>

      <SectionTitle>Conta</SectionTitle>
      <div className="card divide-y divide-hairline-soft">
        <RowLink to="/config" title="Chaves de IA" hint="Provedor e modelo para leitura de fotos e conselheiro" />
        <RowLink to="/config" title="Trocar senha" hint={user?.email ?? ''} />
        <button onClick={cycle} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-ink">Tema</span>
            <span className="block text-[12px] text-steel">{THEME_LABEL[mode]}</span>
          </span>
          <span className="tag-purple capitalize">{mode === 'system' ? 'auto' : mode === 'dark' ? 'escuro' : 'claro'}</span>
        </button>
      </div>

      {user?.role === 'admin' && (
        <>
          <SectionTitle>Administração</SectionTitle>
          <div className="card divide-y divide-hairline-soft">
            <RowLink to="/admin/databases" title="Databases do jogo" hint="Importar versões do FIFA/EA FC" />
            <RowLink to="/admin/usuarios" title="Usuários" hint="Criar, desativar e resetar contas" />
          </div>
        </>
      )}

      <div className="card">
        <button onClick={logout} className="w-full px-4 py-3.5 text-left text-sm font-bold text-error">
          Sair da conta
        </button>
      </div>

      <p className="pt-2 text-center text-[12px] text-steel">
        Dados originais do jogo via{' '}
        <a className="text-link underline" href="https://sofifa.com" target="_blank" rel="noreferrer">SoFIFA</a>{' '}
        (dumps públicos). Projeto pessoal, não comercial.
      </p>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="display px-1 text-[13px] tracking-[0.04em] text-ink">{children}</h2>
}

function RowLink({ to, title, hint }: { to: string; title: string; hint: string }) {
  return (
    <Link to={to} className="flex items-center gap-3 px-4 py-3.5">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ink">{title}</span>
        {hint && <span className="block truncate text-[12px] text-steel">{hint}</span>}
      </span>
      <span className="text-steel" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
    </Link>
  )
}
