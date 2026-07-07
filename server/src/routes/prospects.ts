import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../db/index.js'

const prospectSchema = z.object({
  careerId: z.number().int(),
  sofifaPlayerId: z.number().int(),
  status: z.enum(['observando', 'negociando', 'contratado', 'descartado']).optional(),
  priority: z.number().int().min(1).max(3).optional(),
  notes: z.string().optional(),
})

export function prospectRoutes(app: FastifyInstance) {
  app.get<{ Params: { careerId: string } }>('/api/careers/:careerId/prospects', (req) => {
    const careerId = Number(req.params.careerId)
    const career = db.prepare(`SELECT fifa_version FROM careers WHERE id = ?`).get(careerId) as any
    const prospects = db
      .prepare(`SELECT * FROM prospects WHERE career_id = ? ORDER BY priority, created_at DESC`)
      .all(careerId) as any[]
    for (const pr of prospects) {
      pr.player = db.prepare(`SELECT * FROM sofifa_players WHERE fifa_version = ? AND player_id = ?`)
        .get(career.fifa_version, pr.sofifa_player_id)
    }
    return { prospects }
  })

  app.post('/api/prospects', (req, reply) => {
    const body = prospectSchema.parse(req.body)
    try {
      const res = db.prepare(`
        INSERT INTO prospects (career_id, sofifa_player_id, status, priority, notes)
        VALUES (?,?,?,?,?)
      `).run(body.careerId, body.sofifaPlayerId, body.status ?? 'observando', body.priority ?? 2, body.notes ?? null)
      return { id: Number(res.lastInsertRowid) }
    } catch (e: any) {
      if (String(e).includes('UNIQUE')) return reply.code(409).send({ error: 'Jogador já está na shortlist.' })
      throw e
    }
  })

  app.patch<{ Params: { id: string } }>('/api/prospects/:id', (req) => {
    const body = prospectSchema.partial().parse(req.body)
    const sets: string[] = []
    const params: unknown[] = []
    if (body.status) { sets.push('status = ?'); params.push(body.status) }
    if (body.priority) { sets.push('priority = ?'); params.push(body.priority) }
    if (body.notes !== undefined) { sets.push('notes = ?'); params.push(body.notes) }
    if (!sets.length) return { updated: 0 }
    params.push(Number(req.params.id))
    const res = db.prepare(`UPDATE prospects SET ${sets.join(', ')} WHERE id = ?`).run(...params)

    // Contratado → entra no elenco da carreira (origem sofifa, dados reais).
    if (body.status === 'contratado') {
      const pr = db.prepare(`SELECT * FROM prospects WHERE id = ?`).get(Number(req.params.id)) as any
      if (pr) {
        const career = db.prepare(`SELECT fifa_version FROM careers WHERE id = ?`).get(pr.career_id) as any
        const sp = db.prepare(`SELECT * FROM sofifa_players WHERE fifa_version = ? AND player_id = ?`)
          .get(career.fifa_version, pr.sofifa_player_id) as any
        const exists = db.prepare(
          `SELECT id FROM career_players WHERE career_id = ? AND sofifa_player_id = ?`,
        ).get(pr.career_id, pr.sofifa_player_id)
        if (sp && !exists) {
          db.prepare(`
            INSERT INTO career_players (career_id, origin, sofifa_player_id, name, positions, age,
              overall_original, potential_original, status, in_squad)
            VALUES (?,?,?,?,?,?,?,?, 'elenco', 1)
          `).run(pr.career_id, 'sofifa', sp.player_id, sp.short_name, sp.positions, sp.age, sp.overall, sp.potential)
        }
      }
    }
    return { updated: res.changes }
  })

  app.delete<{ Params: { id: string } }>('/api/prospects/:id', (req) => {
    return { deleted: db.prepare(`DELETE FROM prospects WHERE id = ?`).run(Number(req.params.id)).changes }
  })
}
