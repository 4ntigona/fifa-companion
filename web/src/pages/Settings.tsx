import { useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../auth'
import { getAiSettings, setAiSettings, PROVIDER_LABELS, DEFAULT_MODELS, type AiProvider } from '../store'

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
    <div className="space-y-6 pt-5">
      <div className="flex items-center justify-between">
        <Link to="/mais" className="text-[13px] font-bold uppercase tracking-[0.06em] text-steel hover:text-ink">← Mais</Link>
      </div>
      <h1 className="display text-[24px] not-italic text-ink">Configurações</h1>
      <p className="text-sm text-slate-ink">
        Suas carreiras ficam na sua conta (acessíveis de qualquer aparelho). As chaves de IA
        ficam salvas apenas neste dispositivo — nunca vão para o servidor.
      </p>

      <AiSection ai={ai} onChange={refresh} />
      <AccountSection />
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
            {ai.keys[p] && ' · chave'}
            {ai.activeProvider === p && ' · ativo'}
          </button>
        ))}
      </div>

      <div className="space-y-2 rounded-xl border border-hairline bg-surface-soft p-4">
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
              {testResult.ok ? 'Chave válida' : testResult.error}
            </span>
          )}
        </div>
      </div>
    </section>
  )
}

function AccountSection() {
  const { user } = useAuth()
  const [current, setCurrent] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, setPending] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setMsg(null)
    if (password !== confirm) return setMsg({ ok: false, text: 'As senhas não conferem.' })
    setPending(true)
    try {
      await api('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: current, newPassword: password }),
      })
      setCurrent(''); setPassword(''); setConfirm('')
      setMsg({ ok: true, text: 'Senha alterada. As outras sessões foram desconectadas.' })
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message })
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="card space-y-3 p-6">
      <h2 className="text-lg font-semibold text-ink">Conta</h2>
      <p className="text-sm text-slate-ink">
        Logado como <b>{user?.email}</b>
        {user?.role === 'admin' && <span className="tag-purple ml-2">admin</span>}
      </p>
      <form onSubmit={submit} className="space-y-2 rounded-xl border border-hairline bg-surface-soft p-4">
        <p className="text-[13px] text-steel">Trocar senha</p>
        <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)}
          placeholder="Senha atual" autoComplete="current-password" required className="input" />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          placeholder="Nova senha (mín. 8 caracteres)" autoComplete="new-password" minLength={8} required className="input" />
        <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
          placeholder="Repita a nova senha" autoComplete="new-password" minLength={8} required className="input" />
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? 'Salvando…' : 'Trocar senha'}
        </button>
        {msg && <p className={`text-sm font-medium ${msg.ok ? 'text-success' : 'text-error'}`}>{msg.text}</p>}
      </form>
    </section>
  )
}
