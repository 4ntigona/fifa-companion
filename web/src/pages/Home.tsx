import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api, versionLabel, type VersionInfo } from '../api/client'
import { getAiSettings, PROVIDER_LABELS, DEFAULT_MODELS } from '../store'
import { listCareers } from '../api/user-data'
import { useAuth } from '../auth'
import MigrateLocalBanner from '../components/MigrateLocalBanner'

export default function Home() {
  const { user } = useAuth()
  const { data: careersData } = useQuery({
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

  // Disponibilidade de IA vem do localStorage (BYOK), não do servidor.
  const ai = getAiSettings()
  const aiKey = ai.keys[ai.activeProvider]
  const visionAvailable = Boolean(aiKey)
  const visionProvider = PROVIDER_LABELS[ai.activeProvider]
  const visionModel = ai.models[ai.activeProvider] || DEFAULT_MODELS[ai.activeProvider]

  return (
    <div className="space-y-10 pt-6">
      <MigrateLocalBanner />
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Minhas carreiras</h1>
          <Link to="/nova-carreira" className="btn-primary">+ Nova carreira</Link>
        </div>
        {careers.length === 0 ? (
          <p className="card bg-surface-soft p-6 text-sm text-slate-ink">
            Nenhuma carreira ainda. Crie a primeira para começar a acompanhar seus jogadores.
          </p>
        ) : (
          <ul className="space-y-2">
            {careers.map((c) => (
              <li key={c.id}>
                <Link
                  to={`/carreira/${c.id}`}
                  className="card block p-4 transition-colors hover:border-primary"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-ink">{c.name}</span>
                    <span className="tag-purple">{versionLabel(c.fifa_version)}</span>
                  </div>
                  <div className="mt-1 text-sm text-slate-ink">
                    {c.team_type === 'created' ? `${c.created_team_name} (clube criado)` : c.team?.team_name ?? '—'}
                    {' · '}{c.playerCount} jogadores · Temporada {c.current_season}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {!anyImported && versions.length > 0 && (
        <section className="bg-tint-yellow-bold p-5 text-sm text-charcoal">
          <p className="font-semibold">Nenhuma database do jogo importada ainda.</p>
          <p className="mt-1">
            {user?.role === 'admin' ? (
              <>Importe as versões que serão usadas em <Link to="/admin/databases" className="font-medium text-link underline">Admin › Databases</Link>.</>
            ) : (
              <>Peça ao administrador do app para importar as versões do jogo que você joga.</>
            )}
          </p>
        </section>
      )}

      <section>
        <h2 className="mb-4 text-xl font-semibold tracking-tight text-ink">Câmera / IA</h2>
        <div className={` p-5 text-sm ${visionAvailable ? 'bg-tint-mint text-charcoal' : 'card bg-surface-soft text-slate-ink'}`}>
          {visionAvailable ? (
            <p>
              <span className="font-semibold">Análise de fotos ativa</span> via {visionProvider}
              {' '}(<code className="text-[13px]">{visionModel}</code>) — tire fotos da tela do jogo dentro de uma carreira.
            </p>
          ) : (
            <p>
              Para ativar a leitura de fotos da tela, adicione a chave de um provedor de IA
              (Anthropic, OpenAI, Gemini ou OpenRouter) em{' '}
              <Link to="/config" className="font-medium text-link underline">⚙️ Configurações</Link>.
            </p>
          )}
        </div>
      </section>
    </div>
  )
}
