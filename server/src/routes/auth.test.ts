import { describe, it, expect, beforeEach } from 'vitest'
import Fastify from 'fastify'
import cookie from '@fastify/cookie'
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
  return app
}

function createUser(email: string, password: string, opts: { role?: string; active?: number; mustChange?: number } = {}) {
  const { salt, hash } = hashPassword(password)
  const res = db.prepare(
    `INSERT INTO users (email, password_hash, salt, role, active, must_change_password) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(email, hash, salt, opts.role ?? 'user', opts.active ?? 1, opts.mustChange ?? 0)
  return Number(res.lastInsertRowid)
}

function sidFrom(res: { cookies: { name: string; value: string }[] }) {
  return res.cookies.find((c) => c.name === 'sid')?.value
}

beforeEach(() => {
  db.prepare(`DELETE FROM sessions`).run()
  db.prepare(`DELETE FROM users`).run()
})

describe('rotas de auth (/api/auth)', () => {
  it('login com credenciais válidas seta o cookie e /me devolve o usuário', async () => {
    const app = await buildApp()
    createUser('pedro@example.com', 'senha-forte-1')

    const login = await app.inject({
      method: 'POST', url: '/api/auth/login',
      payload: { email: 'pedro@example.com', password: 'senha-forte-1' },
    })
    expect(login.statusCode).toBe(200)
    const sid = sidFrom(login)
    expect(sid).toBeTruthy()
    const setCookie = String(login.headers['set-cookie'])
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('SameSite=Lax')

    const me = await app.inject({ method: 'GET', url: '/api/auth/me', cookies: { sid: sid! } })
    expect(me.statusCode).toBe(200)
    expect(me.json().user.email).toBe('pedro@example.com')
  })

  it('senha errada, e-mail inexistente e conta desativada dão o MESMO 401', async () => {
    const app = await buildApp()
    createUser('a@example.com', 'certa-12345')
    createUser('inativo@example.com', 'certa-12345', { active: 0 })

    const wrong = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'a@example.com', password: 'errada-1234' } })
    const missing = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'x@example.com', password: 'qualquer-123' } })
    const inactive = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'inativo@example.com', password: 'certa-12345' } })

    for (const res of [wrong, missing, inactive]) {
      expect(res.statusCode).toBe(401)
      expect(res.json().error).toBe('E-mail ou senha incorretos.')
    }
  })

  it('/me sem sessão retorna 401; sessão expirada também', async () => {
    const app = await buildApp()
    const userId = createUser('b@example.com', 'senha-forte-1')

    expect((await app.inject({ method: 'GET', url: '/api/auth/me' })).statusCode).toBe(401)

    const token = createSession(userId)
    db.prepare(`UPDATE sessions SET expires_at = datetime('now', '-1 day')`).run()
    const expired = await app.inject({ method: 'GET', url: '/api/auth/me', cookies: { sid: token } })
    expect(expired.statusCode).toBe(401)
  })

  it('usuário desativado perde a sessão existente', async () => {
    const app = await buildApp()
    const userId = createUser('c@example.com', 'senha-forte-1')
    const token = createSession(userId)

    db.prepare(`UPDATE users SET active = 0 WHERE id = ?`).run(userId)
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', cookies: { sid: token } })
    expect(me.statusCode).toBe(401)
  })

  it('logout revoga a sessão', async () => {
    const app = await buildApp()
    createUser('d@example.com', 'senha-forte-1')
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'd@example.com', password: 'senha-forte-1' } })
    const sid = sidFrom(login)!

    await app.inject({ method: 'POST', url: '/api/auth/logout', cookies: { sid } })
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', cookies: { sid } })
    expect(me.statusCode).toBe(401)
  })

  it('troca de senha exige a atual (exceto senha temporária) e derruba outras sessões', async () => {
    const app = await buildApp()
    const userId = createUser('e@example.com', 'senha-antiga-1')
    const otherSession = createSession(userId)
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'e@example.com', password: 'senha-antiga-1' } })
    const sid = sidFrom(login)!

    const noCurrent = await app.inject({ method: 'POST', url: '/api/auth/change-password', cookies: { sid }, payload: { newPassword: 'senha-nova-12' } })
    expect(noCurrent.statusCode).toBe(401)

    const ok = await app.inject({
      method: 'POST', url: '/api/auth/change-password', cookies: { sid },
      payload: { currentPassword: 'senha-antiga-1', newPassword: 'senha-nova-12' },
    })
    expect(ok.statusCode).toBe(200)
    const newSid = sidFrom(ok)!

    // sessão paralela caiu; a nova segue válida; senha nova loga
    expect((await app.inject({ method: 'GET', url: '/api/auth/me', cookies: { sid: otherSession } })).statusCode).toBe(401)
    expect((await app.inject({ method: 'GET', url: '/api/auth/me', cookies: { sid: newSid } })).statusCode).toBe(200)
    const relogin = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'e@example.com', password: 'senha-nova-12' } })
    expect(relogin.statusCode).toBe(200)
  })

  it('senha temporária: troca sem senha atual e limpa must_change_password', async () => {
    const app = await buildApp()
    createUser('f@example.com', 'temporaria-1', { mustChange: 1 })
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'f@example.com', password: 'temporaria-1' } })
    expect(login.json().user.mustChangePassword).toBe(true)
    const sid = sidFrom(login)!

    const ok = await app.inject({ method: 'POST', url: '/api/auth/change-password', cookies: { sid }, payload: { newPassword: 'definitiva-12' } })
    expect(ok.statusCode).toBe(200)
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', cookies: { sid: sidFrom(ok)! } })
    expect(me.json().user.mustChangePassword).toBe(false)
  })
})
