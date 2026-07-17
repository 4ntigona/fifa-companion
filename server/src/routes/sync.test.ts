import { describe, it, expect, afterEach } from 'vitest'
import Fastify from 'fastify'
import { syncRoutes, pruneExpiredSyncBlobs } from './sync.js'
import { db } from '../db/index.js'

function buildApp() {
  const app = Fastify()
  syncRoutes(app)
  return app
}

const CODE = 'TEST-MIGR-AAAA'
afterEach(() => {
  db.prepare(`DELETE FROM sync_blobs WHERE code = ?`).run(CODE)
})

function seedBlob(data: string, updatedAt = "datetime('now')") {
  db.prepare(`INSERT INTO sync_blobs (code, data, updated_at) VALUES (?, ?, ${updatedAt})`).run(CODE, data)
}

describe('rotas de sync deprecadas (só leitura para migração)', () => {
  it('GET devolve o blob existente (case-insensitive)', async () => {
    const app = buildApp()
    seedBlob('{"v":1}')
    const get = await app.inject({ method: 'GET', url: `/api/sync/${CODE.toLowerCase()}` })
    expect(get.statusCode).toBe(200)
    expect(get.json().data).toBe('{"v":1}')
  })

  it('GET de código inexistente retorna 404', async () => {
    const app = buildApp()
    const get = await app.inject({ method: 'GET', url: '/api/sync/AAAA-AAAA-AAAA' })
    expect(get.statusCode).toBe(404)
  })

  it('escrita foi removida: POST/PUT/DELETE não existem mais', async () => {
    const app = buildApp()
    expect((await app.inject({ method: 'POST', url: '/api/sync', payload: { data: 'x' } })).statusCode).toBe(404)
    expect((await app.inject({ method: 'PUT', url: `/api/sync/${CODE}`, payload: { data: 'x' } })).statusCode).toBe(404)
    expect((await app.inject({ method: 'DELETE', url: `/api/sync/${CODE}` })).statusCode).toBe(404)
  })

  it('prune apaga blobs expirados e preserva os recentes', async () => {
    seedBlob('{"v":1}', "datetime('now', '-400 days')")
    pruneExpiredSyncBlobs()
    expect(db.prepare(`SELECT 1 FROM sync_blobs WHERE code = ?`).get(CODE)).toBeUndefined()
  })
})
