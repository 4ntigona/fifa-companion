import { useState, type FormEvent } from 'react'
import { api } from '../api/client'
import { useAuth, useSetAuthUser } from '../auth'

/** Tela bloqueante do primeiro login: a senha temporária precisa ser trocada. */
export default function ForcePasswordChange() {
  const { user } = useAuth()
  const setAuthUser = useSetAuthUser()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password !== confirm) return setError('As senhas não conferem.')
    setPending(true)
    try {
      await api('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ newPassword: password }),
      })
      if (user) setAuthUser({ ...user, mustChangePassword: false })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="mx-auto max-w-sm pt-16">
      <h1 className="text-2xl font-bold tracking-tight text-ink">Defina sua senha</h1>
      <p className="mt-1 text-sm text-slate-ink">
        Você entrou com uma senha temporária. Escolha a sua senha definitiva para continuar.
      </p>
      <form onSubmit={submit} className="mt-6 space-y-3">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Nova senha (mín. 8 caracteres)"
          autoComplete="new-password"
          minLength={8}
          required
          className="input"
        />
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Repita a nova senha"
          autoComplete="new-password"
          minLength={8}
          required
          className="input"
        />
        {error && <p className="text-sm text-error">{error}</p>}
        <button type="submit" disabled={pending} className="btn-primary w-full py-3">
          {pending ? 'Salvando…' : 'Salvar e continuar'}
        </button>
      </form>
    </div>
  )
}
