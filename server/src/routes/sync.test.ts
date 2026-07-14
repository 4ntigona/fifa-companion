import { describe, it, expect, afterEach } from 'vitest'
import Fastify from 'fastify'
import { syncRoutes } from './sync.js'
import { db } from '../db/index.js'

// Usa o mesmo singleton `db` das rotas (não há injeção de :memory: no db/index.ts —
// fora de escopo deste plano). Por isso, todo código criado aqui é registrado e
// removido ao final, para não deixar lixo na base real de desenvolvimento.
function buildApp() {
  const app = Fastify()
  syncRoutes(app)
  return app
}

const createdCodes: string[] = []
afterEach(() => {
  for (const code of createdCodes.splice(0)) {
    db.prepare(`DELETE FROM sync_blobs WHERE code = ?`).run(code)
  }
})

describe('rotas de sync (/api/sync)', () => {
  it('POST cria um código e GET recupera o mesmo payload', async () => {
    const app = buildApp()
    const post = await app.inject({ method: 'POST', url: '/api/sync', payload: { data: '{"v":1}' } })
    expect(post.statusCode).toBe(200)
    const { code } = post.json()
    createdCodes.push(code)
    expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/)

    const get = await app.inject({ method: 'GET', url: `/api/sync/${code}` })
    expect(get.statusCode).toBe(200)
    expect(get.json().data).toBe('{"v":1}')
  })

  it('GET é case-insensitive (normaliza para maiúsculas)', async () => {
    const app = buildApp()
    const post = await app.inject({ method: 'POST', url: '/api/sync', payload: { data: '{"x":1}' } })
    const { code } = post.json()
    createdCodes.push(code)

    const get = await app.inject({ method: 'GET', url: `/api/sync/${code.toLowerCase()}` })
    expect(get.statusCode).toBe(200)
  })

  it('PUT em código existente atualiza os dados', async () => {
    const app = buildApp()
    const post = await app.inject({ method: 'POST', url: '/api/sync', payload: { data: '{"a":1}' } })
    const { code } = post.json()
    createdCodes.push(code)

    const put = await app.inject({ method: 'PUT', url: `/api/sync/${code}`, payload: { data: '{"a":2}' } })
    expect(put.statusCode).toBe(200)

    const get = await app.inject({ method: 'GET', url: `/api/sync/${code}` })
    expect(get.json().data).toBe('{"a":2}')
  })

  it('PUT em código inexistente retorna 404 (não cria)', async () => {
    const app = buildApp()
    const fakeCode = 'ZZZZ-ZZZZ-ZZZZ'
    const put = await app.inject({ method: 'PUT', url: `/api/sync/${fakeCode}`, payload: { data: '{"x":1}' } })
    expect(put.statusCode).toBe(404)

    const get = await app.inject({ method: 'GET', url: `/api/sync/${fakeCode}` })
    expect(get.statusCode).toBe(404) // confirma que o PUT não criou o código
  })

  it('GET de código inexistente retorna 404', async () => {
    const app = buildApp()
    const get = await app.inject({ method: 'GET', url: '/api/sync/AAAA-AAAA-AAAA' })
    expect(get.statusCode).toBe(404)
  })

  it('DELETE remove o blob', async () => {
    const app = buildApp()
    const post = await app.inject({ method: 'POST', url: '/api/sync', payload: { data: '{"d":1}' } })
    const { code } = post.json()

    const del = await app.inject({ method: 'DELETE', url: `/api/sync/${code}` })
    expect(del.statusCode).toBe(200)
    expect(del.json().deleted).toBe(1)

    const get = await app.inject({ method: 'GET', url: `/api/sync/${code}` })
    expect(get.statusCode).toBe(404)
    // não precisa entrar em createdCodes: já foi removido pelo DELETE
  })

  it('POST rejeita corpo inválido (400)', async () => {
    const app = buildApp()
    const post = await app.inject({ method: 'POST', url: '/api/sync', payload: {} })
    expect(post.statusCode).toBe(400)
  })
})
