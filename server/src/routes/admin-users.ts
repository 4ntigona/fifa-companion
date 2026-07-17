import type { FastifyInstance } from 'fastify'
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { db } from '../db/index.js'
import { mustBeAdmin } from '../auth/plugin.js'
import { hashPassword } from '../auth/passwords.js'
import { revokeUserSessions } from '../auth/sessions.js'

interface UserRow {
  id: number
  email: string
  display_name: string | null
  role: 'admin' | 'user'
  active: number
  must_change_password: number
  created_at: string
}

const publicUser = (u: UserRow) => ({
  id: u.id,
  email: u.email,
  displayName: u.display_name,
  role: u.role,
  active: Boolean(u.active),
  mustChangePassword: Boolean(u.must_change_password),
  createdAt: u.created_at,
})

/** Senha temporária legível (sem 0/O/1/l) — o usuário troca no primeiro login. */
function tempPassword(): string {
  const alphabet = '23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ'
  let out = ''
  const bytes = randomBytes(12)
  for (const b of bytes) out += alphabet[b % alphabet.length]
  return out
}

const createSchema = z.object({
  email: z.string().email(),
  displayName: z.string().optional(),
  role: z.enum(['admin', 'user']).default('user'),
})

const patchSchema = z.object({
  role: z.enum(['admin', 'user']).optional(),
  active: z.boolean().optional(),
  displayName: z.string().optional(),
  resetPassword: z.boolean().optional(),
  revokeSessions: z.boolean().optional(),
})

const countAdmins = () =>
  (db.prepare(`SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND active = 1`).get() as { c: number }).c

export function adminUserRoutes(app: FastifyInstance) {
  app.get('/api/admin/users', { preHandler: [mustBeAdmin] }, () => {
    const rows = db.prepare(
      `SELECT u.*, (SELECT COUNT(*) FROM careers c WHERE c.user_id = u.id) AS career_count
       FROM users u ORDER BY u.id`,
    ).all() as (UserRow & { career_count: number })[]
    return { users: rows.map((u) => ({ ...publicUser(u), careerCount: u.career_count })) }
  })

  app.post('/api/admin/users', { preHandler: [mustBeAdmin] }, (req, reply) => {
    const parsed = createSchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'Dados inválidos.' })
    const { email, displayName, role } = parsed.data

    if (db.prepare(`SELECT 1 FROM users WHERE email = ?`).get(email)) {
      return reply.code(409).send({ error: 'Já existe um usuário com este e-mail.' })
    }
    const password = tempPassword()
    const { salt, hash } = hashPassword(password)
    const res = db.prepare(
      `INSERT INTO users (email, display_name, password_hash, salt, role, must_change_password)
       VALUES (?, ?, ?, ?, ?, 1)`,
    ).run(email, displayName ?? email.split('@')[0], hash, salt, role)
    const row = db.prepare(`SELECT * FROM users WHERE id = ?`).get(Number(res.lastInsertRowid)) as UserRow
    // A senha temporária só aparece AQUI, uma vez — não fica recuperável depois.
    return { user: publicUser(row), tempPassword: password }
  })

  app.patch<{ Params: { id: string } }>('/api/admin/users/:id', { preHandler: [mustBeAdmin] }, (req, reply) => {
    const parsed = patchSchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'Dados inválidos.' })
    const row = db.prepare(`SELECT * FROM users WHERE id = ?`).get(Number(req.params.id)) as UserRow | undefined
    if (!row) return reply.code(404).send({ error: 'Usuário não encontrado.' })
    const p = parsed.data
    const isSelf = row.id === req.user!.id
    const wouldDemote = (p.role === 'user' && row.role === 'admin') || (p.active === false && row.role === 'admin')

    if (isSelf && (p.role === 'user' || p.active === false)) {
      return reply.code(400).send({ error: 'Você não pode rebaixar ou desativar a si mesmo.' })
    }
    if (wouldDemote && countAdmins() <= 1) {
      return reply.code(400).send({ error: 'Não é possível remover o último administrador ativo.' })
    }

    let tempPass: string | undefined
    if (p.resetPassword) {
      tempPass = tempPassword()
      const { salt, hash } = hashPassword(tempPass)
      db.prepare(`UPDATE users SET password_hash = ?, salt = ?, must_change_password = 1 WHERE id = ?`)
        .run(hash, salt, row.id)
      revokeUserSessions(row.id)
    }
    db.prepare(
      `UPDATE users SET
         role = COALESCE(?, role),
         active = COALESCE(?, active),
         display_name = COALESCE(?, display_name)
       WHERE id = ?`,
    ).run(p.role ?? null, p.active === undefined ? null : p.active ? 1 : 0, p.displayName ?? null, row.id)
    if (p.active === false || p.revokeSessions) revokeUserSessions(row.id)

    const updated = db.prepare(`SELECT * FROM users WHERE id = ?`).get(row.id) as UserRow
    return { user: publicUser(updated), ...(tempPass ? { tempPassword: tempPass } : {}) }
  })

  app.delete<{ Params: { id: string } }>('/api/admin/users/:id', { preHandler: [mustBeAdmin] }, (req, reply) => {
    const row = db.prepare(`SELECT * FROM users WHERE id = ?`).get(Number(req.params.id)) as UserRow | undefined
    if (!row) return reply.code(404).send({ error: 'Usuário não encontrado.' })
    if (row.id === req.user!.id) return reply.code(400).send({ error: 'Você não pode excluir a si mesmo.' })
    if (row.role === 'admin' && countAdmins() <= 1) {
      return reply.code(400).send({ error: 'Não é possível excluir o último administrador ativo.' })
    }
    db.prepare(`DELETE FROM users WHERE id = ?`).run(row.id) // cascade: sessões e carreiras
    return { deleted: 1 }
  })
}
