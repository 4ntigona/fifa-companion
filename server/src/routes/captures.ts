import type { FastifyInstance } from 'fastify'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { db, DATA_DIR } from '../db/index.js'
import { analyzeCapture, visionInfo } from '../vision/analyze.js'
import { kaggleCreds } from '../settings.js'

export function captureRoutes(app: FastifyInstance) {
  // Recebe a foto, salva em disco, envia à Claude API e retorna o JSON extraído para revisão.
  app.post('/api/captures', async (req, reply) => {
    const file = await (req as any).file({ limits: { fileSize: 25 * 1024 * 1024 } })
    if (!file) return reply.code(400).send({ error: 'Envie uma imagem (campo "image").' })

    const buf: Buffer = await file.toBuffer()
    const mediaType: string = file.mimetype || 'image/jpeg'
    if (!/^image\/(jpeg|png|webp)$/.test(mediaType)) {
      return reply.code(400).send({ error: 'Formato não suportado (use JPEG, PNG ou WebP).' })
    }

    const careerId = file.fields?.careerId?.value ? Number(file.fields.careerId.value) : null
    const ext = mediaType.split('/')[1].replace('jpeg', 'jpg')
    const fileName = `capture-${Date.now()}.${ext}`
    writeFileSync(join(DATA_DIR, 'captures', fileName), buf)

    let extracted = null
    let error: string | null = null
    try {
      extracted = await analyzeCapture(buf.toString('base64'), mediaType)
    } catch (e) {
      error = String(e instanceof Error ? e.message : e)
    }

    const res = db.prepare(`
      INSERT INTO captures (career_id, file_name, screen_type, extracted_json)
      VALUES (?,?,?,?)
    `).run(careerId, fileName, extracted?.screenType ?? null, extracted ? JSON.stringify(extracted) : null)

    return { id: Number(res.lastInsertRowid), fileName, extracted, error }
  })

  app.get<{ Querystring: { careerId?: string } }>('/api/captures', (req) => {
    const rows = req.query.careerId
      ? db.prepare(`SELECT * FROM captures WHERE career_id = ? ORDER BY created_at DESC`).all(Number(req.query.careerId))
      : db.prepare(`SELECT * FROM captures ORDER BY created_at DESC LIMIT 50`).all()
    return { captures: rows }
  })

  app.patch<{ Params: { id: string } }>('/api/captures/:id', (req) => {
    const { applied } = (req.body ?? {}) as { applied?: boolean }
    return {
      updated: db.prepare(`UPDATE captures SET applied = ? WHERE id = ?`)
        .run(applied ? 1 : 0, Number(req.params.id)).changes,
    }
  })

  app.get('/api/status', () => {
    const imported = db.prepare(
      `SELECT fifa_version AS v, COUNT(*) AS players FROM sofifa_players GROUP BY fifa_version ORDER BY v`,
    ).all()
    const vision = visionInfo()
    return {
      visionAvailable: vision.available,
      visionProvider: vision.providerLabel,
      visionModel: vision.model,
      kaggleConfigured: Boolean(kaggleCreds()),
      importedVersions: imported,
    }
  })
}
