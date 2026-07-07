import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { exportBackup, importBackup, storageUsage, shareBackupOnServer, recoverBackupFromServer } from '../store'

type AiProvider = 'anthropic' | 'openai' | 'gemini' | 'openrouter'

interface ProviderInfo {
  label: string
  configured: boolean
  masked: string | null
  fromEnv: boolean
  model: string
  defaultModel: string
}

interface SettingsData {
  ai: {
    activeProvider: AiProvider
    providers: Record<AiProvider, ProviderInfo>
  }
  kaggle: { configured: boolean; username: string | null; maskedKey: string | null }
}

const KEY_HINTS: Record<AiProvider, { url: string; placeholder: string }> = {
  anthropic: { url: 'https://console.anthropic.com/settings/keys', placeholder: 'sk-ant-…' },
  openai: { url: 'https://platform.openai.com/api-keys', placeholder: 'sk-…' },
  gemini: { url: 'https://aistudio.google.com/apikey', placeholder: 'AIza…' },
  openrouter: { url: 'https://openrouter.ai/settings/keys', placeholder: 'sk-or-…' },
}

export default function SettingsPage() {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api<SettingsData>('/api/settings'),
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['settings'] })
    qc.invalidateQueries({ queryKey: ['status'] })
  }

  return (
    <div className="space-y-6 pt-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Configurações</h1>
      <p className="text-sm text-slate-ink">
        Os tokens ficam salvos apenas neste Mac (no banco local do app) e são usados só para
        baixar a database do jogo (Kaggle) e analisar suas fotos (provedor de IA à sua escolha).
      </p>

      {data && <AiSection ai={data.ai} onSaved={invalidate} />}
      <KaggleSection data={data?.kaggle} onSaved={invalidate} />
      <BackupSection />
    </div>
  )
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return <span className={ok ? 'tag-green' : 'tag bg-tint-gray text-steel'}>{label}</span>
}

function AiSection({ ai, onSaved }: { ai: SettingsData['ai']; onSaved: () => void }) {
  const [selected, setSelected] = useState<AiProvider>(ai.activeProvider)
  const [key, setKey] = useState('')
  const [model, setModel] = useState('')
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null)

  const info = ai.providers[selected]
  const hints = KEY_HINTS[selected]
  const isActive = ai.activeProvider === selected

  const save = useMutation({
    mutationFn: () =>
      api('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({
          provider: selected,
          ...(key && { apiKey: key }),
          ...(model !== '' && { model }),
        }),
      }),
    onSuccess: () => { setKey(''); setModel(''); setTestResult(null); onSaved() },
  })

  const activate = useMutation({
    mutationFn: () => api('/api/settings', { method: 'PUT', body: JSON.stringify({ activeProvider: selected }) }),
    onSuccess: onSaved,
  })

  const test = useMutation({
    mutationFn: () =>
      api<{ ok: boolean; error?: string }>('/api/settings/test-ai', {
        method: 'POST', body: JSON.stringify({ provider: selected }),
      }),
    onSuccess: setTestResult,
  })

  function pick(p: AiProvider) {
    setSelected(p); setKey(''); setModel(''); setTestResult(null)
  }

  return (
    <section className="card space-y-3 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink">IA — leitura de fotos (BYOK)</h2>
        <StatusBadge
          ok={ai.providers[ai.activeProvider].configured}
          label={`ativo: ${ai.providers[ai.activeProvider].label}`}
        />
      </div>
      <p className="text-sm text-slate-ink">
        Traga sua própria chave do provedor que preferir. O app usa o provedor <b>ativo</b> para analisar
        as fotos da tela do jogo.
      </p>

      <div className="flex flex-wrap gap-2">
        {(Object.keys(ai.providers) as AiProvider[]).map((p) => (
          <button key={p} onClick={() => pick(p)} className={selected === p ? 'pill-tab-active' : 'pill-tab'}>
            {ai.providers[p].label}
            {ai.providers[p].configured && ' ✓'}
            {ai.activeProvider === p && ' · ativo'}
          </button>
        ))}
      </div>

      <div className="space-y-2 border border-hairline bg-surface-soft p-4">
        <p className="text-[13px] text-steel">
          Crie a chave em{' '}
          <a href={hints.url} target="_blank" rel="noreferrer" className="text-link underline">
            {hints.url.replace('https://', '')}
          </a>
          {info.configured && (
            <> · salva: {info.fromEnv ? 'via server/.env' : info.masked}</>
          )}
        </p>
        <input
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={info.configured ? `Chave (atual: ${info.masked ?? 'via .env'})` : hints.placeholder}
          type="password"
          autoComplete="off"
          className="input"
        />
        <input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder={`Modelo (atual: ${info.model})`}
          autoComplete="off"
          className="input"
        />
        <p className="text-[13px] text-stone">O modelo precisa aceitar imagens. Padrão: {info.defaultModel}</p>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => save.mutate()} disabled={(!key && !model) || save.isPending} className="btn-primary">
            Salvar
          </button>
          <button onClick={() => test.mutate()} disabled={!info.configured || test.isPending} className="btn-secondary">
            {test.isPending ? 'Testando…' : 'Testar chave'}
          </button>
          {!isActive && (
            <button onClick={() => activate.mutate()} disabled={!info.configured || activate.isPending} className="btn-secondary">
              Usar este provedor
            </button>
          )}
          {testResult && (
            <span className={`text-sm font-medium ${testResult.ok ? 'text-success' : 'text-error'}`}>
              {testResult.ok ? '✓ Chave válida' : testResult.error}
            </span>
          )}
        </div>
      </div>
    </section>
  )
}

function KaggleSection({ data, onSaved }: { data?: SettingsData['kaggle']; onSaved: () => void }) {
  const [username, setUsername] = useState('')
  const [key, setKey] = useState('')
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null)

  const save = useMutation({
    mutationFn: () =>
      api('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({
          ...(username && { kaggleUsername: username }),
          ...(key && { kaggleKey: key }),
        }),
      }),
    onSuccess: () => { setUsername(''); setKey(''); setTestResult(null); onSaved() },
  })
  const test = useMutation({
    mutationFn: () => api<{ ok: boolean; error?: string }>('/api/settings/test-kaggle', { method: 'POST' }),
    onSuccess: setTestResult,
  })

  return (
    <section className="card space-y-3 bg-surface-soft p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink">
          Kaggle — database do jogo <span className="font-normal text-stone">(opcional)</span>
        </h2>
        <StatusBadge ok={Boolean(data?.configured)} label={data?.configured ? 'configurado' : 'não necessário'} />
      </div>
      <p className="text-sm text-slate-ink">
        O dataset é público e a importação funciona <b>sem conta</b>. Só preencha se o download automático
        falhar algum dia (ex.: o Kaggle passar a exigir login): crie o token em{' '}
        <a href="https://www.kaggle.com/settings" target="_blank" rel="noreferrer" className="text-link underline">kaggle.com/settings</a>{' '}
        → API → <b>Create New Token</b> e copie o <code className="bg-surface px-1 text-[13px]">username</code> e a{' '}
        <code className="bg-surface px-1 text-[13px]">key</code> do <code className="bg-surface px-1 text-[13px]">kaggle.json</code>.
      </p>
      {data?.configured && (
        <p className="text-[13px] text-steel">Salvo: usuário <b>{data.username}</b> · key {data.maskedKey}</p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder={data?.username ? `Usuário (atual: ${data.username})` : 'Usuário do Kaggle'}
          autoComplete="off"
          className="input flex-1"
        />
        <input
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={data?.maskedKey ? `Key (atual: ${data.maskedKey})` : 'Key do kaggle.json'}
          type="password"
          autoComplete="off"
          className="input flex-1"
        />
      </div>
      <div className="flex items-center gap-2">
        <button onClick={() => save.mutate()} disabled={(!username && !key) || save.isPending} className="btn-primary">
          Salvar
        </button>
        <button onClick={() => test.mutate()} disabled={!data?.configured || test.isPending} className="btn-secondary">
          {test.isPending ? 'Testando…' : 'Testar conexão'}
        </button>
        {testResult && (
          <span className={`text-sm font-medium ${testResult.ok ? 'text-success' : 'text-error'}`}>
            {testResult.ok ? '✓ Credenciais válidas' : testResult.error}
          </span>
        )}
      </div>
    </section>
  )
}

function BackupSection() {
  const [importStatus, setImportStatus] = useState<{ ok: boolean; message: string } | null>(null)
  const [shareCode, setShareCode] = useState<string | null>(null)
  const [recoverCode, setRecoverCode] = useState('')
  const [loadingShare, setLoadingShare] = useState(false)
  const [loadingRecover, setLoadingRecover] = useState(false)
  const usage = storageUsage()

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportStatus(null)
    try {
      const res = await importBackup(file)
      setImportStatus({
        ok: true,
        message: `✓ Sucesso! ${res.careers} carreiras e ${res.players} jogadores carregados. Atualizando...`,
      })
      setTimeout(() => window.location.reload(), 1500)
    } catch (err: any) {
      setImportStatus({
        ok: false,
        message: `✖ Erro ao importar: ${err.message || err}`,
      })
    }
  }

  const handleShare = async () => {
    setLoadingShare(true)
    setShareCode(null)
    try {
      const code = await shareBackupOnServer()
      setShareCode(code)
    } catch (err: any) {
      alert(`Erro ao gerar chave de sincronização: ${err.message || err}`)
    } finally {
      setLoadingShare(false)
    }
  }

  const handleRecover = async () => {
    if (!recoverCode.trim()) return
    setLoadingRecover(true)
    setImportStatus(null)
    try {
      const res = await recoverBackupFromServer(recoverCode)
      setImportStatus({
        ok: true,
        message: `✓ Sucesso! ${res.careers} carreiras e ${res.players} jogadores recuperados. Atualizando...`,
      })
      setTimeout(() => window.location.reload(), 1500)
    } catch (err: any) {
      setImportStatus({
        ok: false,
        message: `✖ Erro ao recuperar: ${err.message || err}`,
      })
    } finally {
      setLoadingRecover(false)
    }
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    return `${(bytes / 1024).toFixed(2)} KB`
  }

  return (
    <section className="card space-y-4 p-6">
      <h2 className="text-lg font-semibold text-ink">Backup e Sincronização de Dados (LocalStorage)</h2>
      <p className="text-sm text-slate-ink">
        Como os dados da sua carreira ficam salvos localmente no navegador ({formatSize(usage.bytes)} em uso),
        use as opções abaixo para transferir o progresso entre dispositivos ou mantê-los seguros.
      </p>

      <div className="grid gap-6 border-t border-hairline pt-4 md:grid-cols-2">
        {/* Backup via arquivo */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-ink">Backup por Arquivo (.json)</h3>
          <p className="text-xs text-steel">
            Baixe seus dados em um arquivo local ou restaure-os manualmente a qualquer momento.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <button onClick={exportBackup} className="btn-secondary">
              Exportar Arquivo
            </button>
            <label className="btn-secondary cursor-pointer relative">
              Importar Arquivo
              <input
                type="file"
                accept=".json"
                onChange={handleImportFile}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
            </label>
          </div>
        </div>

        {/* Sincronização em nuvem via código */}
        <div className="space-y-2 border-t border-hairline pt-4 md:border-t-0 md:border-l md:border-hairline md:pl-6 md:pt-0">
          <h3 className="text-sm font-semibold text-ink">Sincronização na Nuvem (VPS)</h3>
          <p className="text-xs text-steel">
            Gere uma chave única legível para carregar seus dados na sua VPS e sincronizá-los em outro dispositivo sem arquivos.
          </p>

          <div className="flex flex-col gap-3 pt-1">
            <div className="flex items-center gap-2">
              <button onClick={handleShare} disabled={loadingShare} className="btn-primary">
                {loadingShare ? 'Gerando...' : 'Gerar Chave de Sincronização'}
              </button>
              {shareCode && (
                <div className="bg-navy px-3 py-1.5 font-mono text-sm font-bold text-white tracking-widest">
                  {shareCode}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <input
                value={recoverCode}
                onChange={(e) => setRecoverCode(e.target.value)}
                placeholder="Código (ex: H5F9X2)"
                className="input text-sm font-mono uppercase"
              />
              <button onClick={handleRecover} disabled={loadingRecover || !recoverCode.trim()} className="btn-secondary whitespace-nowrap">
                {loadingRecover ? 'Baixando...' : 'Restaurar via Chave'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {importStatus && (
        <div className={`mt-3 p-3 text-sm ${importStatus.ok ? 'bg-tint-mint text-charcoal' : 'bg-tint-rose text-charcoal'}`}>
          {importStatus.message}
        </div>
      )}
    </section>
  )
}
