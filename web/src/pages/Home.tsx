import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { api, versionLabel, type VersionInfo } from '../api/client'
import { listCareers } from '../api/user-data'
import { useAuth } from '../auth'
import { getActiveCareerId, clearActiveCareerId, setActiveCareerId } from '../hooks'
import MigrateLocalBanner from '../components/MigrateLocalBanner'

/** A porta de entrada: se há uma carreira ativa, o app abre direto nela (o "cold open" do
 *  blueprint). Sem carreira ativa, a Home é o seletor enxuto — o resto (conta, admin, tema)
 *  vive na tab Mais. */
export default function Home() {
  const { user } = useAuth()
  const nav = useNavigate()

  const { data: careersData, isLoading } = useQuery({
    queryKey: ['careers'],
    queryFn: async () => listCareers(),
  })
  const { data: versionsData } = useQuery({
    queryKey: ['versions'],
    queryFn: () => api<{ versions: VersionInfo[] }>('/api/versions'),
  })

  const careers = careersData?.careers ?? []
  const versions = versionsData?.versions ?? []
  const anyImported = versions.some((v) => v.imported)

  // abre direto na carreira ativa, se ela ainda existir
  const activeId = getActiveCareerId()
  useEffect(() => {
    if (!careersData) return
    if (activeId && careers.some((c) => c.id === activeId)) {
      nav(`/carreira/${activeId}`, { replace: true })
    } else if (activeId) {
      clearActiveCareerId() // carreira ativa apagada — limpa o ponteiro
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [careersData])

  return (
    <div className="space-y-6 pt-5">
      <MigrateLocalBanner />

      <div className="flex items-center justify-between">
        <h1 className="display text-[24px] not-italic text-ink">Minhas carreiras</h1>
        <Link to="/nova-carreira" className="btn-primary">+ Nova</Link>
      </div>

      {isLoading ? (
        <p className="text-sm text-steel">Carregando…</p>
      ) : careers.length === 0 ? (
        <p className="card bg-surface-soft p-6 text-sm text-slate-ink">
          Nenhuma carreira ainda. Crie a primeira para começar a acompanhar o desenvolvimento do time.
        </p>
      ) : (
        <ul className="space-y-2">
          {careers.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => { setActiveCareerId(c.id); nav(`/carreira/${c.id}`) }}
                className="card flex w-full items-center gap-3 p-4 text-left hover:border-primary"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold text-ink">{c.name}</span>
                  <span className="block truncate text-[13px] text-steel">
                    {c.team_type === 'created' ? `${c.created_team_name} (clube criado)` : c.team?.team_name ?? '—'}
                    {' · '}{c.playerCount} jogadores · {c.current_season}
                  </span>
                </span>
                <span className="tag-purple shrink-0">{versionLabel(c.fifa_version)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {!anyImported && versions.length > 0 && (
        <div className="rounded-xl bg-tint-yellow-bold p-5 text-sm text-charcoal">
          <p className="font-semibold">Nenhuma database do jogo importada ainda.</p>
          <p className="mt-1">
            {user?.role === 'admin' ? (
              <>Importe as versões que serão usadas em <Link to="/admin/databases" className="font-medium text-link underline">Mais › Databases</Link>.</>
            ) : (
              <>Peça ao administrador do app para importar as versões do jogo que você joga.</>
            )}
          </p>
        </div>
      )}
    </div>
  )
}
