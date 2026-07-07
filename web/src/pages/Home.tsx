import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api, versionLabel, type Career, type VersionInfo } from '../api/client'
import { listCareers, getAiSettings } from '../store'

interface ImportStatus {
  running: boolean
  phase: string
  detail: string
  versions: number[]
  progress: number | null
  error: string | null
}

export default function Home() {
  const qc = useQueryClient()
  const [selectedVersions, setSelectedVersions] = useState<number[]>([])

  const { data: careersData } = useQuery({
    queryKey: ['careers'],
    queryFn: () => listCareers(),
  })
  const { data: versionsData } = useQuery({
    queryKey: ['versions'],
    queryFn: () => api<{ versions: VersionInfo[] }>('/api/versions'),
  })
  const { data: status } = useQuery({
    queryKey: ['status'],
    queryFn: () => api<{ visionAvailable: boolean; visionProvider: string; visionModel: string; kaggleConfigured: boolean; importedVersions: { v: number; players: number }[] }>('/api/status'),
  })
  const { data: importStatus } = useQuery({
    queryKey: ['import-status'],
    queryFn: () => api<ImportStatus>('/api/import/status'),
    refetchInterval: (q) => (q.state.data?.running ? 1000 : false),
  })

  const startImport = useMutation({
    mutationFn: (versions: number[]) =>
      api('/api/import', { method: 'POST', body: JSON.stringify({ versions }) }),
    onSuccess: () => {
      setSelectedVersions([])
      qc.invalidateQueries({ queryKey: ['import-status'] })
    },
  })

  // Ao concluir uma importação, atualiza as versões/status.
  const importing = Boolean(importStatus?.running)
  const phase = importStatus?.phase
  useEffect(() => {
    if (phase === 'concluído' || phase === 'erro') {
      qc.invalidateQueries({ queryKey: ['versions'] })
      qc.invalidateQueries({ queryKey: ['status'] })
    }
  }, [phase, qc])

  const ai = getAiSettings()
  const localActiveProvider = ai.activeProvider
  const localHasKey = Boolean(ai.keys[localActiveProvider])
  const providerLabel = localActiveProvider === 'anthropic' ? 'Anthropic (Claude)' : localActiveProvider === 'openai' ? 'OpenAI (ChatGPT)' : localActiveProvider === 'gemini' ? 'Google Gemini' : 'OpenRouter'
  const modelLabel = ai.models[localActiveProvider] || (localActiveProvider === 'anthropic' ? 'claude-sonnet-5' : localActiveProvider === 'openai' ? 'gpt-5.1' : localActiveProvider === 'gemini' ? 'gemini-2.5-flash' : 'google/gemini-2.5-flash')

  const visionActive = localHasKey || Boolean(status?.visionAvailable)
  const visionProvider = localHasKey ? providerLabel : status?.visionProvider ?? ''
  const visionModel = localHasKey ? modelLabel : status?.visionModel ?? ''

  const careers = careersData?.careers ?? []
  const versions = versionsData?.versions ?? []
  const anyImported = versions.some((v) => v.imported)

  function toggleVersion(v: number) {
    setSelectedVersions((sel) => (sel.includes(v) ? sel.filter((x) => x !== v) : [...sel, v]))
  }

  return (
    <div className="space-y-10 pt-6">
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

      <section>
        <h2 className="mb-4 text-xl font-semibold tracking-tight text-ink">Databases do jogo</h2>
        {!anyImported && !importing && (
          <div className="mb-3  bg-tint-yellow-bold p-5 text-sm text-charcoal">
            <p className="font-semibold">Nenhuma database importada ainda.</p>
            <p className="mt-1">
              O app usa os dados originais do jogo (dumps reais extraídos do SoFIFA).
              Toque nas versões que você joga e importe — o download é automático, sem conta em lugar nenhum.
            </p>
          </div>
        )}

        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {versions.map((v) => {
            const selected = selectedVersions.includes(v.fifaVersion)
            return (
              <li key={v.fifaVersion}>
                <button
                  onClick={() => !v.imported && !importing && toggleVersion(v.fifaVersion)}
                  disabled={v.imported || importing}
                  className={`w-full  p-3 text-center text-sm transition-colors ${
                    v.imported
                      ? 'bg-tint-mint text-charcoal'
                      : selected
                        ? 'bg-tint-lavender text-charcoal ring-2 ring-primary'
                        : 'border border-hairline bg-surface-soft text-stone hover:border-hairline-strong'
                  }`}
                >
                  <div className="font-semibold">{v.label}</div>
                  <div className="text-xs">
                    {v.imported ? `${v.playerCount.toLocaleString('pt-BR')} jogadores` : selected ? 'selecionada' : 'não importada'}
                  </div>
                </button>
              </li>
            )
          })}
        </ul>

        {selectedVersions.length > 0 && !importing && (
          <button
            onClick={() => startImport.mutate([...selectedVersions].sort((a, b) => a - b))}
            disabled={startImport.isPending}
            className="btn-primary mt-3 w-full py-3"
          >
            Importar {selectedVersions.map(versionLabel).join(', ')}
          </button>
        )}
        {startImport.isError && <p className="mt-2 text-sm text-error">{(startImport.error as Error).message}</p>}

        {importStatus && importStatus.phase !== 'ocioso' && (importing || importStatus.phase === 'erro' || importStatus.phase === 'concluído') && (
          <div className={`mt-3  p-5 text-sm ${
            importStatus.phase === 'erro' ? 'bg-tint-rose text-charcoal'
            : importStatus.phase === 'concluído' ? 'bg-tint-mint text-charcoal'
            : 'bg-tint-sky text-charcoal'
          }`}>
            <div className="flex items-center justify-between">
              <span className="font-semibold capitalize">
                {importing ? `⏳ ${importStatus.phase}` : importStatus.phase === 'erro' ? '✖ Erro na importação' : '✓ Importação concluída'}
              </span>
              {importing && importStatus.progress != null && (
                <span className="text-xs font-medium">{Math.round(importStatus.progress * 100)}%</span>
              )}
            </div>
            {importing && importStatus.progress != null && (
              <div className="mt-2 h-2 overflow-hidden  bg-canvas/70">
                <div className="h-full bg-primary transition-all" style={{ width: `${importStatus.progress * 100}%` }} />
              </div>
            )}
            <p className="mt-1 text-[13px]">{importStatus.error ?? importStatus.detail}</p>
            {importing && <p className="mt-1 text-xs text-slate-ink">O arquivo de jogadores é grande — a primeira importação demora; pode deixar rodando.</p>}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-xl font-semibold tracking-tight text-ink">Câmera / IA</h2>
        <div className={` p-5 text-sm ${visionActive ? 'bg-tint-mint text-charcoal' : 'card bg-surface-soft text-slate-ink'}`}>
          {visionActive ? (
            <p>
              <span className="font-semibold">Análise de fotos activa</span> via {visionProvider}
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
