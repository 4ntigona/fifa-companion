import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api, versionLabel, type VersionInfo } from '../../api/client'
import ServerErrorCard from '../../components/ServerErrorCard'

interface ImportStatus {
  running: boolean
  phase: string
  detail: string
  versions: number[]
  progress: number | null
  error: string | null
}

/** Admin › Databases: importação das databases originais do jogo (Kaggle/SoFIFA). */
export default function AdminDatabases() {
  const qc = useQueryClient()
  const [selectedVersions, setSelectedVersions] = useState<number[]>([])

  const { data: versionsData, isError: versionsError, error: versionsErr, refetch: refetchVersions } = useQuery({
    queryKey: ['versions'],
    queryFn: () => api<{ versions: VersionInfo[] }>('/api/versions'),
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

  const importing = Boolean(importStatus?.running)
  const phase = importStatus?.phase
  useEffect(() => {
    if (phase === 'concluído' || phase === 'erro') {
      qc.invalidateQueries({ queryKey: ['versions'] })
    }
  }, [phase, qc])

  const versions = versionsData?.versions ?? []
  const anyImported = versions.some((v) => v.imported)

  function toggleVersion(v: number) {
    setSelectedVersions((sel) => (sel.includes(v) ? sel.filter((x) => x !== v) : [...sel, v]))
  }

  return (
    <div className="space-y-6 pt-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Admin · Databases do jogo</h1>
        <Link to="/admin/usuarios" className="text-sm font-medium text-steel hover:text-ink">Usuários →</Link>
      </div>
      <p className="text-sm text-slate-ink">
        Dados originais do jogo (dumps reais do SoFIFA via Kaggle) — compartilhados por todos os
        usuários, somente leitura no app. Importar de novo uma versão atualiza os registros dela.
      </p>

      {versionsError && (
        <ServerErrorCard message={(versionsErr as Error).message} onRetry={() => refetchVersions()} />
      )}
      {!anyImported && !importing && !versionsError && (
        <div className="bg-tint-yellow-bold p-5 text-sm text-charcoal">
          <p className="font-semibold">Nenhuma database importada ainda.</p>
          <p className="mt-1">Toque nas versões desejadas e importe — o download é automático.</p>
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
          className="btn-primary w-full py-3"
        >
          Importar {selectedVersions.map(versionLabel).join(', ')}
        </button>
      )}
      {startImport.isError && <p className="text-sm text-error">{(startImport.error as Error).message}</p>}

      {importStatus && importStatus.phase !== 'ocioso' && (importing || importStatus.phase === 'erro' || importStatus.phase === 'concluído') && (
        <div className={`p-5 text-sm ${
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
            <div className="mt-2 h-2 overflow-hidden bg-canvas/70">
              <div className="h-full bg-primary transition-all" style={{ width: `${importStatus.progress * 100}%` }} />
            </div>
          )}
          <p className="mt-1 text-[13px]">{importStatus.error ?? importStatus.detail}</p>
          {importing && <p className="mt-1 text-xs text-slate-ink">O arquivo de jogadores é grande — a primeira importação demora; pode deixar rodando.</p>}
        </div>
      )}
    </div>
  )
}
