import { useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { api } from '../api/client'
import {
  getAiSettings, setAiSettings, PROVIDER_LABELS, DEFAULT_MODELS,
  exportBackup, importBackup, storageUsage, type AiProvider,
} from '../store'

const PROVIDERS: AiProvider[] = ['anthropic', 'openai', 'gemini', 'openrouter']

const KEY_HINTS: Record<AiProvider, { url: string; placeholder: string }> = {
  anthropic: { url: 'https://console.anthropic.com/settings/keys', placeholder: 'sk-ant-…' },
  openai: { url: 'https://platform.openai.com/api-keys', placeholder: 'sk-…' },
  gemini: { url: 'https://aistudio.google.com/apikey', placeholder: 'AIza…' },
  openrouter: { url: 'https://openrouter.ai/settings/keys', placeholder: 'sk-or-…' },
}

const mask = (v?: string) => (v ? (v.length <= 8 ? '••••' : `${v.slice(0, 4)}…${v.slice(-4)}`) : null)

export default function SettingsPage() {
  const [ai, setAi] = useState(getAiSettings())
  const refresh = () => setAi(getAiSettings())

  return (
    <div className="space-y-6 pt-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Configurações</h1>
      <p className="text-sm text-slate-ink">
        Suas carreiras e chaves de IA ficam salvas apenas neste dispositivo (no navegador).
        Use o backup abaixo para levar os dados para outro aparelho.
      </p>

      <AiSection ai={ai} onChange={refresh} />
      <BackupSection />
    </div>
  )
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return <span className={ok ? 'tag-green' : 'tag bg-tint-gray text-steel'}>{label}</span>
}

function AiSection({ ai, onChange }: { ai: ReturnType<typeof getAiSettings>; onChange: () => void }) {
  const [selected, setSelected] = useState<AiProvider>(ai.activeProvider)
  const [key, setKey] = useState('')
  const [model, setModel] = useState('')
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null)

  const savedKey = ai.keys[selected]
  const savedModel = ai.models[selected] || DEFAULT_MODELS[selected]
  const hints = KEY_HINTS[selected]
  const isActive = ai.activeProvider === selected

  function pick(p: AiProvider) {
    setSelected(p); setKey(''); setModel(''); setTestResult(null)
  }
  function saveKeyModel() {
    if (key) setAiSettings({ key: { provider: selected, value: key.trim() } })
    if (model) setAiSettings({ model: { provider: selected, value: model.trim() } })
    setKey(''); setModel(''); setTestResult(null); onChange()
  }
  function activate() {
    setAiSettings({ activeProvider: selected }); onChange()
  }
  function clearKey() {
    setAiSettings({ key: { provider: selected, value: '' } }); setTestResult(null); onChange()
  }

  const test = useMutation({
    mutationFn: () =>
      api<{ ok: boolean; error?: string }>('/api/test-ai', {
        method: 'POST', body: JSON.stringify({ provider: selected, apiKey: savedKey ?? '' }),
      }),
    onSuccess: setTestResult,
  })

  return (
    <section className="card space-y-3 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink">IA — leitura de fotos (BYOK)</h2>
        <StatusBadge
          ok={Boolean(ai.keys[ai.activeProvider])}
          label={`ativo: ${PROVIDER_LABELS[ai.activeProvider]}`}
        />
      </div>
      <p className="text-sm text-slate-ink">
        Traga sua própria chave do provedor que preferir. O app usa o provedor <b>ativo</b> para analisar
        as fotos da tela do jogo. As chaves ficam só neste dispositivo.
      </p>

      <div className="flex flex-wrap gap-2">
        {PROVIDERS.map((p) => (
          <button key={p} onClick={() => pick(p)} className={selected === p ? 'pill-tab-active' : 'pill-tab'}>
            {PROVIDER_LABELS[p]}
            {ai.keys[p] && ' ✓'}
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
          {savedKey && <> · salva: {mask(savedKey)}</>}
        </p>
        <input
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={savedKey ? `Chave (atual: ${mask(savedKey)})` : hints.placeholder}
          type="password"
          autoComplete="off"
          className="input"
        />
        <input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder={`Modelo (atual: ${savedModel})`}
          autoComplete="off"
          className="input"
        />
        <p className="text-[13px] text-stone">O modelo precisa aceitar imagens. Padrão: {DEFAULT_MODELS[selected]}</p>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={saveKeyModel} disabled={!key && !model} className="btn-primary">Salvar</button>
          <button onClick={() => test.mutate()} disabled={!savedKey || test.isPending} className="btn-secondary">
            {test.isPending ? 'Testando…' : 'Testar chave'}
          </button>
          {!isActive && (
            <button onClick={activate} disabled={!savedKey} className="btn-secondary">Usar este provedor</button>
          )}
          {savedKey && <button onClick={clearKey} className="btn-secondary">Remover chave</button>}
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

function BackupSection() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const kb = (storageUsage().bytes / 1024).toFixed(1)

  async function onImport(file: File | undefined) {
    if (!file) return
    if (!confirm('Importar um backup substitui TODOS os dados atuais deste dispositivo. Continuar?')) return
    try {
      const r = await importBackup(file)
      setMsg({ ok: true, text: `Backup importado: ${r.careers} carreira(s), ${r.players} jogador(es). Recarregando…` })
      setTimeout(() => location.reload(), 1200)
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    }
  }

  return (
    <section className="card space-y-3 bg-surface-soft p-6">
      <h2 className="text-lg font-semibold text-ink">Backup — exportar / importar</h2>
      <p className="text-sm text-slate-ink">
        Seus dados vivem neste navegador ({kb} KB). Exporte um arquivo <code className="bg-surface px-1 text-[13px]">.json</code>{' '}
        para guardar ou transferir para outro dispositivo. Importar substitui os dados atuais.
      </p>
      <input ref={fileRef} type="file" accept="application/json,.json" className="hidden"
        onChange={(e) => onImport(e.target.files?.[0])} />
      <div className="flex flex-wrap gap-2">
        <button onClick={() => exportBackup()} className="btn-primary">Exportar backup</button>
        <button onClick={() => fileRef.current?.click()} className="btn-secondary">Importar backup</button>
      </div>
      {msg && <p className={`text-sm font-medium ${msg.ok ? 'text-success' : 'text-error'}`}>{msg.text}</p>}
    </section>
  )
}
