import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../db/index.js'

const careerPlayerSchema = z.object({
  careerId: z.number().int(),
  origin: z.enum(['sofifa', 'generated', 'youth', 'regen']),
  sofifaPlayerId: z.number().int().optional(),
  name: z.string().min(1),
  positions: z.string().min(1),
  age: z.number().int().optional(),
  overallOriginal: z.number().int().optional(),
  potentialOriginal: z.number().int().optional(),
  strengths: z.string().optional(),
  notes: z.string().optional(),
  jerseyNumber: z.number().int().optional(),
  status: z.string().optional(),
  inSquad: z.boolean().optional(),
})

const snapshotSchema = z.object({
  season: z.string().min(4),
  dateIngame: z.string().optional(),
  overall: z.number().int().optional(),
  potential: z.number().int().optional(),
  position: z.string().optional(),
  attributes: z.record(z.string(), z.union([z.number(), z.string()])).optional(),
  formNotes: z.string().optional(),
})

export function playerRoutes(app: FastifyInstance) {
  app.get<{ Params: { careerId: string }; Querystring: { group?: string } }>(
    '/api/careers/:careerId/players',
    (req) => {
      const careerId = Number(req.params.careerId)
      const group = req.query.group // 'squad' | 'youth' | undefined
      let where = 'career_id = ?'
      if (group === 'squad') where += ` AND in_squad = 1`
      if (group === 'youth') where += ` AND origin IN ('youth','regen')`
      const players = db
        .prepare(`SELECT * FROM career_players WHERE ${where} ORDER BY origin, status, name`)
        .all(careerId) as any[]

      const career = db.prepare(`SELECT fifa_version FROM careers WHERE id = ?`).get(careerId) as any
      const latestSnap = db.prepare(
        `SELECT * FROM player_snapshots WHERE career_player_id = ? ORDER BY id DESC LIMIT 1`,
      )
      for (const p of players) {
        if (p.origin === 'sofifa' && p.sofifa_player_id && career) {
          p.sofifa = db.prepare(`SELECT * FROM sofifa_players WHERE fifa_version = ? AND player_id = ?`)
            .get(career.fifa_version, p.sofifa_player_id)
        }
        p.latestSnapshot = latestSnap.get(p.id) ?? null
      }
      return { players }
    },
  )

  app.post('/api/career-players', (req, reply) => {
    const body = careerPlayerSchema.parse(req.body)
    if (body.origin === 'sofifa' && !body.sofifaPlayerId) {
      return reply.code(400).send({ error: 'Jogador da database exige sofifaPlayerId.' })
    }
    const res = db.prepare(`
      INSERT INTO career_players (career_id, origin, sofifa_player_id, name, positions, age,
        overall_original, potential_original, strengths, notes, jersey_number, status, in_squad)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      body.careerId, body.origin, body.sofifaPlayerId ?? null, body.name, body.positions,
      body.age ?? null, body.overallOriginal ?? null, body.potentialOriginal ?? null,
      body.strengths ?? null, body.notes ?? null, body.jerseyNumber ?? null,
      body.status ?? (body.origin === 'youth' || body.origin === 'regen' ? 'base' : 'elenco'),
      body.inSquad === false ? 0 : 1,
    )
    return { id: Number(res.lastInsertRowid) }
  })

  app.get<{ Params: { id: string } }>('/api/career-players/:id', (req, reply) => {
    const p = db.prepare(`SELECT * FROM career_players WHERE id = ?`).get(Number(req.params.id)) as any
    if (!p) return reply.code(404).send({ error: 'Jogador não encontrado' })
    const career = db.prepare(`SELECT * FROM careers WHERE id = ?`).get(p.career_id) as any
    if (p.origin === 'sofifa' && p.sofifa_player_id) {
      p.sofifa = db.prepare(`SELECT * FROM sofifa_players WHERE fifa_version = ? AND player_id = ?`)
        .get(career.fifa_version, p.sofifa_player_id)
    }
    if (p.origin === 'regen' && p.sofifa_player_id) {
      p.regenOf = db.prepare(`SELECT * FROM sofifa_players WHERE fifa_version = ? AND player_id = ?`)
        .get(career.fifa_version, p.sofifa_player_id)
    }
    p.snapshots = db.prepare(
      `SELECT * FROM player_snapshots WHERE career_player_id = ? ORDER BY season, date_ingame, id`,
    ).all(p.id)
    return { player: p, career }
  })

  app.patch<{ Params: { id: string } }>('/api/career-players/:id', (req) => {
    const body = careerPlayerSchema.partial().parse(req.body)
    const map: Record<string, string> = {
      name: 'name', positions: 'positions', age: 'age', overallOriginal: 'overall_original',
      potentialOriginal: 'potential_original', strengths: 'strengths', notes: 'notes',
      jerseyNumber: 'jersey_number', status: 'status',
    }
    const sets: string[] = []
    const params: unknown[] = []
    for (const [key, col] of Object.entries(map)) {
      const v = (body as any)[key]
      if (v !== undefined) { sets.push(`${col} = ?`); params.push(v) }
    }
    if (body.inSquad !== undefined) { sets.push('in_squad = ?'); params.push(body.inSquad ? 1 : 0) }
    if (!sets.length) return { updated: 0 }
    params.push(Number(req.params.id))
    return { updated: db.prepare(`UPDATE career_players SET ${sets.join(', ')} WHERE id = ?`).run(...params).changes }
  })

  app.delete<{ Params: { id: string } }>('/api/career-players/:id', (req) => {
    return { deleted: db.prepare(`DELETE FROM career_players WHERE id = ?`).run(Number(req.params.id)).changes }
  })

  // Snapshots de desenvolvimento: toda alteração de stats é registrada com temporada/data do jogo.
  app.post<{ Params: { id: string } }>('/api/career-players/:id/snapshots', (req) => {
    const body = snapshotSchema.parse(req.body)
    const res = db.prepare(`
      INSERT INTO player_snapshots (career_player_id, season, date_ingame, overall, potential, position, attributes_json, form_notes)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(
      Number(req.params.id), body.season, body.dateIngame ?? null, body.overall ?? null,
      body.potential ?? null, body.position ?? null,
      body.attributes ? JSON.stringify(body.attributes) : null, body.formNotes ?? null,
    )
    return { id: Number(res.lastInsertRowid) }
  })

  app.delete<{ Params: { id: string; snapId: string } }>('/api/career-players/:id/snapshots/:snapId', (req) => {
    return {
      deleted: db.prepare(`DELETE FROM player_snapshots WHERE id = ? AND career_player_id = ?`)
        .run(Number(req.params.snapId), Number(req.params.id)).changes,
    }
  })
}
