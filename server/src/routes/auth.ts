import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../db/index.js'
import { hashPassword, verifyPassword } from '../auth/passwords.js'
import {
  SESSION_COOKIE,
  SESSION_DAYS,
  createSession,
  revokeSession,
  revokeUserSessions,
} from '../auth/sessions.js'
import { mustBeUser } from '../auth/plugin.js'

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) })
const changePasswordSchema = z.object({
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8, 'A nova senha precisa de pelo menos 8 caracteres.'),
})

// Alvo de verify quando o e-mail não existe — o tempo de resposta fica igual ao
// de senha errada (não revela quais e-mails têm conta).
const DUMMY = hashPassword('senha-inexistente')

const cookieOpts = () => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  secure: process.env.NODE_ENV === 'production',
  maxAge: SESSION_DAYS * 24 * 60 * 60,
})

interface UserRow {
  id: number
  email: string
  display_name: string | null
  password_hash: string
  salt: string
  role: 'admin' | 'user'
  active: number
  must_change_password: number
}

const publicUser = (u: UserRow) => ({
  id: u.id,
  email: u.email,
  displayName: u.display_name,
  role: u.role,
  mustChangePassword: Boolean(u.must_change_password),
})

export function authRoutes(app: FastifyInstance) {
  app.post('/api/auth/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, (req, reply) => {
    const parsed = loginSchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'Informe e-mail e senha.' })

    const row = db.prepare(`SELECT * FROM users WHERE email = ?`).get(parsed.data.email) as UserRow | undefined
    const ok = row
      ? verifyPassword(parsed.data.password, row.salt, row.password_hash)
      : verifyPassword(parsed.data.password, DUMMY.salt, DUMMY.hash)
    // Mensagem idêntica para e-mail inexistente, senha errada e conta desativada.
    if (!row || !ok || !row.active) return reply.code(401).send({ error: 'E-mail ou senha incorretos.' })

    const token = createSession(row.id)
    reply.setCookie(SESSION_COOKIE, token, cookieOpts())
    return { user: publicUser(row) }
  })

  app.post('/api/auth/logout', (req, reply) => {
    const token = req.cookies?.[SESSION_COOKIE]
    if (token) revokeSession(token)
    reply.clearCookie(SESSION_COOKIE, { path: '/' })
    return { ok: true }
  })

  app.get('/api/auth/me', { preHandler: [mustBeUser] }, (req) => {
    return { user: req.user }
  })

  app.post('/api/auth/change-password', { preHandler: [mustBeUser] }, (req, reply) => {
    const parsed = changePasswordSchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' })

    const row = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.user!.id) as UserRow
    // Senha atual obrigatória, exceto no primeiro login com senha temporária.
    if (!row.must_change_password) {
      if (!parsed.data.currentPassword || !verifyPassword(parsed.data.currentPassword, row.salt, row.password_hash)) {
        return reply.code(401).send({ error: 'Senha atual incorreta.' })
      }
    }

    const { salt, hash } = hashPassword(parsed.data.newPassword)
    db.prepare(`UPDATE users SET password_hash = ?, salt = ?, must_change_password = 0 WHERE id = ?`)
      .run(hash, salt, row.id)
    // Troca de senha derruba as outras sessões; a atual é recriada para seguir logado.
    revokeUserSessions(row.id)
    const token = createSession(row.id)
    reply.setCookie(SESSION_COOKIE, token, cookieOpts())
    return { ok: true }
  })
}
