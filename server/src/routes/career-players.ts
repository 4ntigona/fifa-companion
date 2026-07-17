import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../db/index.js'
import { mustBeUser } from '../auth/plugin.js'
import { getOwnedCareer, hydrateCareer, hydrateSofifa, type CareerRow } from './careers.js'

interface PlayerRow {
  id: number
  career_id: number
  origin: 'sofifa' | 'generated' | 'youth' | 'regen'
  sofifa_player_id: number | null
  name: string
  positions: string
  age: number | null
  overall_original: number | null
  potential_original: number | null
  strengths: string | null
  notes: string | null
  jersey_number: number | null
  status: string
  in_squad: number
}

/** Jogador + carreira dona, escopado pelo usuário — 404 para dado de outro usuário. */
function getOwnedPlayer(userId: number, playerId: number): { player: PlayerRow; career: CareerRow } | undefined {
  const player = db.prepare(
    `SELECT cp.* FROM career_players cp JOIN careers c ON c.id = cp.career_id
     WHERE cp.id = ? AND c.user_id = ?`,
  ).get(playerId, userId) as PlayerRow | undefined
  if (!player) return undefined
  const career = db.prepare(`SELECT * FROM careers WHERE id = ?`).get(player.career_id) as CareerRow
  return { player, career }
}

const createSchema = z.object({
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

const patchSchema = z.object({
  status: z.string().optional(),
  inSquad: z.boolean().optional(),
  jerseyNumber: z.number().int().nullable().optional(),
})

const snapshotSchema = z.object({
  season: z.string().min(1),
  dateIngame: z.string().optional(),
  overall: z.number().int().optional(),
  potential: z.number().int().optional(),
  position: z.string().optional(),
  formNotes: z.string().optional(),
})

const capturedRowSchema = z.discriminatedUnion('target', [
  z.object({
    target: z.literal('new'),
    origin: z.enum(['youth', 'regen', 'generated']),
    name: z.string().min(1),
    positions: z.string().min(1),
    age: z.number().int().optional(),
    overallOriginal: z.number().int().optional(),
    potentialOriginal: z.number().int().optional(),
    notes: z.string().optional(),
    jerseyNumber: z.number().int().optional(),
    status: z.string(),
    inSquad: z.boolean(),
    snapshot: snapshotSchema.optional(),
  }),
  z.object({
    target: z.literal('existing'),
    targetPlayerId: z.number().int(),
    snapshot: snapshotSchema,
  }),
])

function insertSnapshot(playerId: number, snap: z.infer<typeof snapshotSchema>): number {
  const res = db.prepare(
    `INSERT INTO player_snapshots (career_player_id, season, date_ingame, overall, potential, position, form_notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(playerId, snap.season, snap.dateIngame ?? null, snap.overall ?? null, snap.potential ?? null,
    snap.position ?? null, snap.formNotes ?? null)
  return Number(res.lastInsertRowid)
}

export function careerPlayerRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>('/api/careers/:id/players', { preHandler: [mustBeUser] }, (req, reply) => {
    const career = getOwnedCareer(req.user!.id, Number(req.params.id))
    if (!career) return reply.code(404).send({ error: 'Carreira não encontrada' })
    const rows = db.prepare(`SELECT * FROM career_players WHERE career_id = ? ORDER BY id`).all(career.id) as PlayerRow[]
    const lastSnap = db.prepare(
      `SELECT * FROM player_snapshots WHERE career_player_id = ? ORDER BY id DESC LIMIT 1`,
    )
    return {
      players: rows.map((p) => ({
        ...p,
        sofifa: hydrateSofifa(career.fifa_version, p.sofifa_player_id),
        latestSnapshot: lastSnap.get(p.id) ?? null,
      })),
    }
  })

  app.post<{ Params: { id: string } }>('/api/careers/:id/players', { preHandler: [mustBeUser] }, (req, reply) => {
    const career = getOwnedCareer(req.user!.id, Number(req.params.id))
    if (!career) return reply.code(404).send({ error: 'Carreira não encontrada' })
    const parsed = createSchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'Dados inválidos.' })
    const i = parsed.data
    const res = db.prepare(
      `INSERT INTO career_players (career_id, origin, sofifa_player_id, name, positions, age,
         overall_original, potential_original, strengths, notes, jersey_number, status, in_squad)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      career.id, i.origin, i.sofifaPlayerId ?? null, i.name, i.positions, i.age ?? null,
      i.overallOriginal ?? null, i.potentialOriginal ?? null, i.strengths ?? null, i.notes ?? null,
      i.jerseyNumber ?? null,
      i.status ?? (i.origin === 'youth' || i.origin === 'regen' ? 'base' : 'elenco'),
      i.inSquad === false ? 0 : 1,
    )
    return { id: Number(res.lastInsertRowid) }
  })

  // Grava jogadores capturados por foto (e snapshots) numa transação — tudo ou nada.
  app.post<{ Params: { id: string } }>('/api/careers/:id/capture/apply', { preHandler: [mustBeUser] }, (req, reply) => {
    const career = getOwnedCareer(req.user!.id, Number(req.params.id))
    if (!career) return reply.code(404).send({ error: 'Carreira não encontrada' })
    const parsed = z.object({ rows: z.array(capturedRowSchema).min(1).max(100) }).safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'Dados inválidos.' })

    try {
      const created = db.transaction(() => {
        for (const row of parsed.data.rows) {
          let playerId: number
          if (row.target === 'new') {
            const res = db.prepare(
              `INSERT INTO career_players (career_id, origin, sofifa_player_id, name, positions, age,
                 overall_original, potential_original, notes, jersey_number, status, in_squad)
               VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            ).run(career.id, row.origin, row.name, row.positions, row.age ?? null,
              row.overallOriginal ?? null, row.potentialOriginal ?? null, row.notes ?? null,
              row.jerseyNumber ?? null, row.status, row.inSquad ? 1 : 0)
            playerId = Number(res.lastInsertRowid)
          } else {
            const owned = getOwnedPlayer(req.user!.id, row.targetPlayerId)
            if (!owned || owned.career.id !== career.id) throw new Error('Jogador alvo não encontrado nesta carreira.')
            playerId = owned.player.id
          }
          if (row.snapshot) insertSnapshot(playerId, row.snapshot)
        }
        return parsed.data.rows.length
      })()
      return { created }
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message })
    }
  })

  app.get<{ Params: { id: string } }>('/api/career-players/:id', { preHandler: [mustBeUser] }, (req, reply) => {
    const owned = getOwnedPlayer(req.user!.id, Number(req.params.id))
    if (!owned) return reply.code(404).send({ error: 'Jogador não encontrado' })
    const snapshots = db.prepare(`SELECT * FROM player_snapshots WHERE career_player_id = ? ORDER BY id`).all(owned.player.id)
    return {
      player: {
        ...owned.player,
        sofifa: hydrateSofifa(owned.career.fifa_version, owned.player.sofifa_player_id),
        snapshots,
      },
      career: hydrateCareer(owned.career),
    }
  })

  app.patch<{ Params: { id: string } }>('/api/career-players/:id', { preHandler: [mustBeUser] }, (req, reply) => {
    const owned = getOwnedPlayer(req.user!.id, Number(req.params.id))
    if (!owned) return reply.code(404).send({ error: 'Jogador não encontrado' })
    const parsed = patchSchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'Dados inválidos.' })
    const p = parsed.data
    db.prepare(
      `UPDATE career_players SET
         status = COALESCE(?, status),
         in_squad = COALESCE(?, in_squad),
         jersey_number = CASE WHEN ? THEN ? ELSE jersey_number END
       WHERE id = ?`,
    ).run(
      p.status ?? null,
      p.inSquad === undefined ? null : p.inSquad ? 1 : 0,
      p.jerseyNumber !== undefined ? 1 : 0, p.jerseyNumber ?? null,
      owned.player.id,
    )
    return { updated: 1 }
  })

  app.delete<{ Params: { id: string } }>('/api/career-players/:id', { preHandler: [mustBeUser] }, (req, reply) => {
    const owned = getOwnedPlayer(req.user!.id, Number(req.params.id))
    if (!owned) return reply.code(404).send({ error: 'Jogador não encontrado' })
    db.prepare(`DELETE FROM career_players WHERE id = ?`).run(owned.player.id) // cascade: snapshots
    return { deleted: 1 }
  })

  app.post<{ Params: { id: string } }>('/api/career-players/:id/snapshots', { preHandler: [mustBeUser] }, (req, reply) => {
    const owned = getOwnedPlayer(req.user!.id, Number(req.params.id))
    if (!owned) return reply.code(404).send({ error: 'Jogador não encontrado' })
    const parsed = snapshotSchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'Dados inválidos.' })
    return { id: insertSnapshot(owned.player.id, parsed.data) }
  })
}
