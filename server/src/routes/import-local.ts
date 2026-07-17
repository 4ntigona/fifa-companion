import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../db/index.js'
import { mustBeUser } from '../auth/plugin.js'

/**
 * Migração one-shot do modelo antigo (blob do localStorage / chave de restauração)
 * para a conta do usuário. Remapeia os ids locais para os novos numa única
 * transação — tudo ou nada.
 */

const careerSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  fifa_version: z.number().int(),
  team_type: z.enum(['existing', 'created']),
  sofifa_team_id: z.number().int().nullish(),
  created_team_name: z.string().nullish(),
  created_team_budget_eur: z.number().nullish(),
  created_team_league: z.string().nullish(),
  replaced_team_id: z.number().int().nullish(),
  objectives: z.string().nullish(),
  squad_quality: z.string().nullish(),
  current_season: z.string(),
  current_date_ingame: z.string().nullish(),
})

const playerSchema = z.object({
  id: z.number().int(),
  career_id: z.number().int(),
  origin: z.enum(['sofifa', 'generated', 'youth', 'regen']),
  sofifa_player_id: z.number().int().nullish(),
  name: z.string(),
  positions: z.string(),
  age: z.number().int().nullish(),
  overall_original: z.number().int().nullish(),
  potential_original: z.number().int().nullish(),
  strengths: z.string().nullish(),
  notes: z.string().nullish(),
  jersey_number: z.number().int().nullish(),
  status: z.string(),
  in_squad: z.number().int(),
})

const snapshotSchema = z.object({
  id: z.number().int(),
  career_player_id: z.number().int(),
  season: z.string(),
  date_ingame: z.string().nullish(),
  overall: z.number().int().nullish(),
  potential: z.number().int().nullish(),
  position: z.string().nullish(),
  attributes_json: z.string().nullish(),
  form_notes: z.string().nullish(),
})

const prospectSchema = z.object({
  id: z.number().int(),
  career_id: z.number().int(),
  sofifa_player_id: z.number().int(),
  status: z.string(),
  priority: z.number().int(),
  notes: z.string().nullish(),
})

const blobSchema = z.object({
  version: z.literal(1),
  careers: z.array(careerSchema.passthrough()).max(200),
  careerPlayers: z.array(playerSchema.passthrough()).max(20_000),
  snapshots: z.array(snapshotSchema.passthrough()).max(100_000),
  prospects: z.array(prospectSchema.passthrough()).max(5_000),
})

export function importLocalRoutes(app: FastifyInstance) {
  app.post('/api/me/import-local', {
    preHandler: [mustBeUser],
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, (req, reply) => {
    const parsed = blobSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Backup inválido — formato não reconhecido.' })
    }
    const data = parsed.data
    const userId = req.user!.id

    try {
      const result = db.transaction(() => {
        const careerIdMap = new Map<number, number>()
        const playerIdMap = new Map<number, number>()

        for (const c of data.careers) {
          const res = db.prepare(
            `INSERT INTO careers (user_id, name, fifa_version, team_type, sofifa_team_id, created_team_name,
               created_team_budget_eur, created_team_league, replaced_team_id, objectives, squad_quality,
               current_season, current_date_ingame)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ).run(userId, c.name, c.fifa_version, c.team_type, c.sofifa_team_id ?? null, c.created_team_name ?? null,
            c.created_team_budget_eur ?? null, c.created_team_league ?? null, c.replaced_team_id ?? null,
            c.objectives ?? null, c.squad_quality ?? null, c.current_season, c.current_date_ingame ?? null)
          careerIdMap.set(c.id, Number(res.lastInsertRowid))
        }

        for (const p of data.careerPlayers) {
          const careerId = careerIdMap.get(p.career_id)
          if (!careerId) continue // jogador órfão no blob — ignora em vez de falhar tudo
          const res = db.prepare(
            `INSERT INTO career_players (career_id, origin, sofifa_player_id, name, positions, age,
               overall_original, potential_original, strengths, notes, jersey_number, status, in_squad)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ).run(careerId, p.origin, p.sofifa_player_id ?? null, p.name, p.positions, p.age ?? null,
            p.overall_original ?? null, p.potential_original ?? null, p.strengths ?? null, p.notes ?? null,
            p.jersey_number ?? null, p.status, p.in_squad ? 1 : 0)
          playerIdMap.set(p.id, Number(res.lastInsertRowid))
        }

        let snapshots = 0
        for (const s of data.snapshots) {
          const playerId = playerIdMap.get(s.career_player_id)
          if (!playerId) continue
          db.prepare(
            `INSERT INTO player_snapshots (career_player_id, season, date_ingame, overall, potential, position,
               attributes_json, form_notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          ).run(playerId, s.season, s.date_ingame ?? null, s.overall ?? null, s.potential ?? null,
            s.position ?? null, s.attributes_json ?? null, s.form_notes ?? null)
          snapshots++
        }

        let prospects = 0
        for (const pr of data.prospects) {
          const careerId = careerIdMap.get(pr.career_id)
          if (!careerId) continue
          db.prepare(
            `INSERT OR IGNORE INTO prospects (career_id, sofifa_player_id, status, priority, notes)
             VALUES (?, ?, ?, ?, ?)`,
          ).run(careerId, pr.sofifa_player_id, pr.status, pr.priority, pr.notes ?? null)
          prospects++
        }

        return { careers: careerIdMap.size, players: playerIdMap.size, snapshots, prospects }
      })()
      return result
    } catch {
      return reply.code(500).send({ error: 'Falha ao importar os dados — nada foi gravado.' })
    }
  })
}
