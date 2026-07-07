import type { FastifyInstance } from 'fastify'
import { randomInt } from 'node:crypto'
import { z } from 'zod'
import { db } from '../db/index.js'

// Sem 0/O, 1/I/L — reduz erro de leitura/digitação ao anotar a chave.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
const CODE_LEN = 12
const MAX_BLOB_SIZE = 5 * 1024 * 1024 // folga generosa para o JSON do backup

function generateCode(): string {
  let raw = ''
  for (let i = 0; i < CODE_LEN; i++) raw += ALPHABET[randomInt(ALPHABET.length)]
  return raw.match(/.{1,4}/g)!.join('-') // XXXX-XXXX-XXXX
}

const bodySchema = z.object({ data: z.string().min(1).max(MAX_BLOB_SIZE) })
const normalizeCode = (raw: string) => raw.trim().toUpperCase()

/**
 * Chave de restauração: guarda o backup completo do usuário (localStorage) sob um
 * código gerado, para ele restaurar em outro aparelho sem precisar de arquivo.
 * O código é a única credencial — trate-o como senha. Não há autenticação nem
 * associação a conta; qualquer um com o código lê/escreve aquele blob.
 */
export function syncRoutes(app: FastifyInstance) {
  app.post('/api/sync', (req, reply) => {
    const parsed = bodySchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'Dados inválidos.' })

    let code = generateCode()
    while (db.prepare(`SELECT 1 FROM sync_blobs WHERE code = ?`).get(code)) code = generateCode()

    db.prepare(`INSERT INTO sync_blobs (code, data) VALUES (?, ?)`).run(code, parsed.data.data)
    return { code }
  })

  app.put<{ Params: { code: string } }>('/api/sync/:code', (req, reply) => {
    const parsed = bodySchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'Dados inválidos.' })
    const code = normalizeCode(req.params.code)

    db.prepare(`
      INSERT INTO sync_blobs (code, data, updated_at) VALUES (?, ?, datetime('now'))
      ON CONFLICT(code) DO UPDATE SET data = excluded.data, updated_at = datetime('now')
    `).run(code, parsed.data.data)
    return { updated: true }
  })

  app.get<{ Params: { code: string } }>('/api/sync/:code', (req, reply) => {
    const code = normalizeCode(req.params.code)
    const row = db.prepare(`SELECT data, updated_at FROM sync_blobs WHERE code = ?`)
      .get(code) as { data: string; updated_at: string } | undefined
    if (!row) return reply.code(404).send({ error: 'Chave não encontrada.' })
    return { data: row.data, updatedAt: row.updated_at }
  })

  app.delete<{ Params: { code: string } }>('/api/sync/:code', (req) => {
    const code = normalizeCode(req.params.code)
    const res = db.prepare(`DELETE FROM sync_blobs WHERE code = ?`).run(code)
    return { deleted: res.changes }
  })
}
