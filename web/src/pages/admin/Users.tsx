import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../../api/client'
import { useAuth } from '../../auth'
import ConfirmDialog from '../../components/ConfirmDialog'

interface AdminUser {
  id: number
  email: string
  displayName: string | null
  role: 'admin' | 'user'
  active: boolean
  mustChangePassword: boolean
  createdAt: string
  careerCount: number
}

/** Admin › Usuários: criação (senha temporária), ativação, reset e exclusão. */
export default function AdminUsers() {
  const qc = useQueryClient()
  const { user: me } = useAuth()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'user' | 'admin'>('user')
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [toDelete, setToDelete] = useState<AdminUser | null>(null)

  const { data } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => api<{ users: AdminUser[] }>('/api/admin/users'),
  })
  const users = data?.users ?? []
  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin-users'] })

  const create = useMutation({
    mutationFn: () =>
      api<{ user: AdminUser; tempPassword: string }>('/api/admin/users', {
        method: 'POST', body: JSON.stringify({ email: email.trim(), role }),
      }),
    onSuccess: (r) => {
      setEmail('')
      setNotice({ ok: true, text: `Usuário ${r.user.email} criado. Senha temporária (aparece só agora): ${r.tempPassword}` })
      invalidate()
    },
    onError: (e) => setNotice({ ok: false, text: (e as Error).message }),
  })

  const patch = useMutation({
    mutationFn: (input: { id: number; body: Record<string, unknown> }) =>
      api<{ user: AdminUser; tempPassword?: string }>(`/api/admin/users/${input.id}`, {
        method: 'PATCH', body: JSON.stringify(input.body),
      }),
    onSuccess: (r) => {
      setNotice(r.tempPassword
        ? { ok: true, text: `Senha de ${r.user.email} resetada. Temporária (aparece só agora): ${r.tempPassword}` }
        : { ok: true, text: `${r.user.email} atualizado.` })
      invalidate()
    },
    onError: (e) => setNotice({ ok: false, text: (e as Error).message }),
  })

  const remove = useMutation({
    mutationFn: (id: number) => api(`/api/admin/users/${id}`, { method: 'DELETE' }),
    onSuccess: () => { setNotice({ ok: true, text: 'Usuário excluído.' }); invalidate() },
    onError: (e) => setNotice({ ok: false, text: (e as Error).message }),
  })

  function onCreate(e: FormEvent) {
    e.preventDefault()
    setNotice(null)
    create.mutate()
  }

  return (
    <div className="space-y-6 pt-5">
      <div className="flex items-center justify-between">
        <Link to="/mais" className="text-[13px] font-bold uppercase tracking-[0.06em] text-steel hover:text-ink">← Mais</Link>
        <Link to="/admin/databases" className="text-sm font-medium text-steel hover:text-ink">Databases →</Link>
      </div>
      <h1 className="display text-[24px] not-italic text-ink">Usuários</h1>

      <form onSubmit={onCreate} className="card space-y-2 p-5">
        <p className="text-sm font-semibold text-ink">Criar usuário</p>
        <p className="text-[13px] text-steel">
          O usuário entra com uma senha temporária e é obrigado a trocá-la no primeiro login.
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="email@exemplo.com" required className="input flex-1"
          />
          <select value={role} onChange={(e) => setRole(e.target.value as 'user' | 'admin')} className="input w-auto">
            <option value="user">usuário</option>
            <option value="admin">admin</option>
          </select>
          <button type="submit" disabled={create.isPending || !email.trim()} className="btn-primary">
            {create.isPending ? 'Criando…' : 'Criar'}
          </button>
        </div>
      </form>

      {notice && (
        <p className={`break-all rounded-xl p-3 text-sm font-medium ${notice.ok ? 'bg-tint-mint text-charcoal' : 'bg-tint-rose text-charcoal'}`}>
          {notice.text}
        </p>
      )}

      <ul className="space-y-2">
        {users.map((u) => (
          <li key={u.id} className={`card p-4 ${u.active ? '' : 'opacity-60'}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="font-semibold text-ink">{u.email}</span>
                {u.role === 'admin' && <span className="tag-purple ml-2">admin</span>}
                {!u.active && <span className="tag ml-2 bg-tint-gray text-steel">desativado</span>}
                {u.mustChangePassword && <span className="tag-orange ml-2">senha temporária</span>}
                {u.id === me?.id && <span className="tag ml-2 bg-tint-gray text-steel">você</span>}
              </div>
              <span className="text-[13px] text-steel">{u.careerCount} carreira(s)</span>
            </div>
            {u.id !== me?.id && (
              <div className="mt-3 flex flex-wrap gap-2 text-[13px]">
                <button onClick={() => patch.mutate({ id: u.id, body: { active: !u.active } })} className="btn-secondary">
                  {u.active ? 'Desativar' : 'Reativar'}
                </button>
                <button onClick={() => patch.mutate({ id: u.id, body: { role: u.role === 'admin' ? 'user' : 'admin' } })} className="btn-secondary">
                  {u.role === 'admin' ? 'Tornar usuário' : 'Tornar admin'}
                </button>
                <button onClick={() => patch.mutate({ id: u.id, body: { resetPassword: true } })} className="btn-secondary">
                  Resetar senha
                </button>
                <button onClick={() => patch.mutate({ id: u.id, body: { revokeSessions: true } })} className="btn-secondary">
                  Derrubar sessões
                </button>
                <button onClick={() => setToDelete(u)} className="btn-secondary text-error">
                  Excluir
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {toDelete && (
        <ConfirmDialog
          title="Excluir usuário"
          message={`Excluir ${toDelete.email} apaga TODAS as carreiras e dados dele (${toDelete.careerCount} carreira(s)). Esta ação não tem volta. Continuar?`}
          confirmLabel="Excluir"
          onConfirm={() => { const u = toDelete; setToDelete(null); remove.mutate(u.id) }}
          onCancel={() => setToDelete(null)}
        />
      )}
    </div>
  )
}
