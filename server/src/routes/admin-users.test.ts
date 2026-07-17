import { describe, it, expect, beforeEach } from 'vitest'
import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import { adminUserRoutes } from './admin-users.js'
import { authRoutes } from './auth.js'
import { authPlugin } from '../auth/plugin.js'
import { hashPassword } from '../auth/passwords.js'
import { createSession } from '../auth/sessions.js'
import { db } from '../db/index.js'

async function buildApp() {
  const app = Fastify()
  await app.register(cookie)
  authPlugin(app)
  authRoutes(app)
  adminUserRoutes(app)
  return app
}

function makeUser(email: string, role: 'admin' | 'user') {
  const { salt, hash } = hashPassword('senha-de-teste-1')
  const res = db.prepare(`INSERT INTO users (email, password_hash, salt, role) VALUES (?, ?, ?, ?)`)
    .run(email, hash, salt, role)
  const id = Number(res.lastInsertRowid)
  return { id, sid: createSession(id) }
}

beforeEach(() => {
  db.prepare(`DELETE FROM sessions`).run()
  db.prepare(`DELETE FROM users`).run()
})

describe('rotas de admin (/api/admin/users)', () => {
  it('usuário comum recebe 403; sem sessão, 401', async () => {
    const app = await buildApp()
    const u = makeUser('comum@example.com', 'user')
    expect((await app.inject({ method: 'GET', url: '/api/admin/users' })).statusCode).toBe(401)
    expect((await app.inject({ method: 'GET', url: '/api/admin/users', cookies: { sid: u.sid } })).statusCode).toBe(403)
  })

  it('admin cria usuário com senha temporária que exige troca no 1º login', async () => {
    const app = await buildApp()
    const admin = makeUser('root@example.com', 'admin')
    const created = await app.inject({
      method: 'POST', url: '/api/admin/users', cookies: { sid: admin.sid },
      payload: { email: 'novo@example.com' },
    })
    expect(created.statusCode).toBe(200)
    const { user, tempPassword } = created.json()
    expect(user.mustChangePassword).toBe(true)
    expect(tempPassword).toHaveLength(12)

    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'novo@example.com', password: tempPassword } })
    expect(login.statusCode).toBe(200)
    expect(login.json().user.mustChangePassword).toBe(true)

    // e-mail duplicado = 409
    const dup = await app.inject({ method: 'POST', url: '/api/admin/users', cookies: { sid: admin.sid }, payload: { email: 'novo@example.com' } })
    expect(dup.statusCode).toBe(409)
  })

  it('desativar derruba as sessões do usuário', async () => {
    const app = await buildApp()
    const admin = makeUser('root@example.com', 'admin')
    const u = makeUser('alvo@example.com', 'user')
    await app.inject({ method: 'PATCH', url: `/api/admin/users/${u.id}`, cookies: { sid: admin.sid }, payload: { active: false } })
    expect((await app.inject({ method: 'GET', url: '/api/auth/me', cookies: { sid: u.sid } })).statusCode).toBe(401)
  })

  it('reset de senha gera temporária nova e derruba sessões', async () => {
    const app = await buildApp()
    const admin = makeUser('root@example.com', 'admin')
    const u = makeUser('alvo@example.com', 'user')
    const res = await app.inject({ method: 'PATCH', url: `/api/admin/users/${u.id}`, cookies: { sid: admin.sid }, payload: { resetPassword: true } })
    const { tempPassword } = res.json()
    expect(tempPassword).toHaveLength(12)
    expect((await app.inject({ method: 'GET', url: '/api/auth/me', cookies: { sid: u.sid } })).statusCode).toBe(401)
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'alvo@example.com', password: tempPassword } })
    expect(login.statusCode).toBe(200)
  })

  it('guardas: não deleta a si mesmo, não rebaixa a si mesmo, não remove o último admin', async () => {
    const app = await buildApp()
    const admin = makeUser('root@example.com', 'admin')
    expect((await app.inject({ method: 'DELETE', url: `/api/admin/users/${admin.id}`, cookies: { sid: admin.sid } })).statusCode).toBe(400)
    expect((await app.inject({ method: 'PATCH', url: `/api/admin/users/${admin.id}`, cookies: { sid: admin.sid }, payload: { role: 'user' } })).statusCode).toBe(400)

    // segundo admin pode rebaixar o primeiro, mas aí o primeiro não pode rebaixar o segundo (último)
    const second = makeUser('root2@example.com', 'admin')
    const demote = await app.inject({ method: 'PATCH', url: `/api/admin/users/${second.id}`, cookies: { sid: admin.sid }, payload: { role: 'user' } })
    expect(demote.statusCode).toBe(200)
    const lastGuard = await app.inject({ method: 'PATCH', url: `/api/admin/users/${second.id}`, cookies: { sid: admin.sid }, payload: { role: 'admin' } })
    expect(lastGuard.statusCode).toBe(200) // re-promover ok
  })

  it('deletar usuário remove as carreiras dele (cascade)', async () => {
    const app = await buildApp()
    const admin = makeUser('root@example.com', 'admin')
    const u = makeUser('alvo@example.com', 'user')
    db.prepare(`INSERT INTO careers (user_id, name, fifa_version, team_type) VALUES (?, 'x', 16, 'existing')`).run(u.id)
    await app.inject({ method: 'DELETE', url: `/api/admin/users/${u.id}`, cookies: { sid: admin.sid } })
    expect((db.prepare(`SELECT COUNT(*) c FROM careers WHERE user_id = ?`).get(u.id) as any).c).toBe(0)
  })
})
