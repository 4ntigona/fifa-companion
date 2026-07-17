import type { FastifyInstance } from 'fastify'
import { db } from '../db/index.js'

const TTL_DAYS = Number(process.env.SYNC_TTL_DAYS ?? 180) // blobs sem atualização há mais tempo que isso são apagados

const normalizeCode = (raw: string) => raw.trim().toUpperCase()

/** Apaga blobs sem atualização há mais de TTL_DAYS dias. Chamado no boot. */
export function pruneExpiredSyncBlobs(): number {
  const res = db.prepare(`DELETE FROM sync_blobs WHERE updated_at < datetime('now', '-' || ? || ' days')`).run(TTL_DAYS)
  return res.changes
}

/**
 * DEPRECADO (some na limpeza pós-v0.3.000): as chaves de restauração eram o
 * backup do modelo local-first, substituído pelas contas. Só a LEITURA continua
 * no ar, como fonte da migração one-shot (banner pós-login → /api/me/import-local).
 * Escrita (POST/PUT/DELETE) foi removida — não se criam chaves novas.
 */
export function syncRoutes(app: FastifyInstance) {
  app.get<{ Params: { code: string } }>('/api/sync/:code', (req, reply) => {
    const code = normalizeCode(req.params.code)
    const row = db.prepare(`SELECT data, updated_at FROM sync_blobs WHERE code = ?`)
      .get(code) as { data: string; updated_at: string } | undefined
    if (!row) return reply.code(404).send({ error: 'Chave não encontrada.' })
    return { data: row.data, updatedAt: row.updated_at }
  })
}
