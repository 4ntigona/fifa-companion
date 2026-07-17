import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../db/index.js'
import { mustBeUser } from '../auth/plugin.js'
import { getOwnedCareer, hydrateSofifa, type CareerRow } from './careers.js'

interface ProspectRow {
  id: number
  career_id: number
  sofifa_player_id: number
  status: string
  priority: number
  notes: string | null
}

function getOwnedProspect(userId: number, prospectId: number): { prospect: ProspectRow; career: CareerRow } | undefined {
  const prospect = db.prepare(
    `SELECT p.* FROM prospects p JOIN careers c ON c.id = p.career_id
     WHERE p.id = ? AND c.user_id = ?`,
  ).get(prospectId, userId) as ProspectRow | undefined
  if (!prospect) return undefined
  const career = db.prepare(`SELECT * FROM careers WHERE id = ?`).get(prospect.career_id) as CareerRow
  return { prospect, career }
}

const patchSchema = z.object({
  status: z.enum(['observando', 'negociando', 'contratado', 'descartado']).optional(),
  notes: z.string().optional(),
  priority: z.number().int().min(1).max(3).optional(),
})

export function prospectRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>('/api/careers/:id/prospects', { preHandler: [mustBeUser] }, (req, reply) => {
    const career = getOwnedCareer(req.user!.id, Number(req.params.id))
    if (!career) return reply.code(404).send({ error: 'Carreira não encontrada' })
    const rows = db.prepare(`SELECT * FROM prospects WHERE career_id = ? ORDER BY id`).all(career.id) as ProspectRow[]
    return {
      prospects: rows.map((p) => ({ ...p, player: hydrateSofifa(career.fifa_version, p.sofifa_player_id) })),
    }
  })

  app.post<{ Params: { id: string } }>('/api/careers/:id/prospects', { preHandler: [mustBeUser] }, (req, reply) => {
    const career = getOwnedCareer(req.user!.id, Number(req.params.id))
    if (!career) return reply.code(404).send({ error: 'Carreira não encontrada' })
    const parsed = z.object({ sofifaPlayerId: z.number().int() }).safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'Dados inválidos.' })
    try {
      const res = db.prepare(
        `INSERT INTO prospects (career_id, sofifa_player_id) VALUES (?, ?)`,
      ).run(career.id, parsed.data.sofifaPlayerId)
      return { id: Number(res.lastInsertRowid) }
    } catch (e) {
      if (String((e as Error).message).includes('UNIQUE')) {
        return reply.code(409).send({ error: 'Jogador já está na shortlist.' })
      }
      throw e
    }
  })

  app.patch<{ Params: { id: string } }>('/api/prospects/:id', { preHandler: [mustBeUser] }, (req, reply) => {
    const owned = getOwnedProspect(req.user!.id, Number(req.params.id))
    if (!owned) return reply.code(404).send({ error: 'Prospecto não encontrado' })
    const parsed = patchSchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'Dados inválidos.' })
    const p = parsed.data

    db.transaction(() => {
      db.prepare(
        `UPDATE prospects SET
           status = COALESCE(?, status),
           notes = COALESCE(?, notes),
           priority = COALESCE(?, priority)
         WHERE id = ?`,
      ).run(p.status ?? null, p.notes ?? null, p.priority ?? null, owned.prospect.id)

      // contratado → entra no elenco com os dados reais copiados da database
      if (p.status === 'contratado') {
        const sofifa = hydrateSofifa(owned.career.fifa_version, owned.prospect.sofifa_player_id) as
          | { player_id: number; short_name: string; positions: string; age: number; overall: number; potential: number }
          | undefined
        if (sofifa) {
          const exists = db.prepare(
            `SELECT 1 FROM career_players WHERE career_id = ? AND sofifa_player_id = ?`,
          ).get(owned.career.id, sofifa.player_id)
          if (!exists) {
            db.prepare(
              `INSERT INTO career_players (career_id, origin, sofifa_player_id, name, positions, age,
                 overall_original, potential_original, status, in_squad)
               VALUES (?, 'sofifa', ?, ?, ?, ?, ?, ?, 'elenco', 1)`,
            ).run(owned.career.id, sofifa.player_id, sofifa.short_name, sofifa.positions, sofifa.age,
              sofifa.overall, sofifa.potential)
          }
        }
      }
    })()
    return { updated: 1 }
  })

  app.delete<{ Params: { id: string } }>('/api/prospects/:id', { preHandler: [mustBeUser] }, (req, reply) => {
    const owned = getOwnedProspect(req.user!.id, Number(req.params.id))
    if (!owned) return reply.code(404).send({ error: 'Prospecto não encontrado' })
    db.prepare(`DELETE FROM prospects WHERE id = ?`).run(owned.prospect.id)
    return { deleted: 1 }
  })
}
