import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../db/index.js'
import { mustBeUser } from '../auth/plugin.js'
import { CREATE_CLUB_MIN_VERSION } from '../sofifa/source.js'

/* Helpers compartilhados pelas rotas de dados per-user (players/prospects importam daqui). */

export interface CareerRow {
  id: number
  user_id: number
  name: string
  fifa_version: number
  team_type: 'existing' | 'created'
  sofifa_team_id: number | null
  created_team_name: string | null
  created_team_budget_eur: number | null
  created_team_league: string | null
  replaced_team_id: number | null
  objectives: string | null
  squad_quality: string | null
  current_season: string
  current_date_ingame: string | null
}

/** Carreira do usuário ou undefined — TODA rota de dados passa por aqui (isolamento). */
export function getOwnedCareer(userId: number, careerId: number): CareerRow | undefined {
  return db.prepare(`SELECT * FROM careers WHERE id = ? AND user_id = ?`).get(careerId, userId) as CareerRow | undefined
}

const teamOf = (version: number, teamId: number | null) =>
  teamId == null ? undefined : db.prepare(`SELECT * FROM sofifa_teams WHERE fifa_version = ? AND team_id = ?`).get(version, teamId)

/** Reidrata o shape que o front espera (team/replacedTeam vindos da database real). */
export function hydrateCareer(row: CareerRow) {
  const { user_id: _u, ...career } = row
  return {
    ...career,
    team: teamOf(row.fifa_version, row.sofifa_team_id),
    replacedTeam: teamOf(row.fifa_version, row.replaced_team_id),
  }
}

export function hydrateSofifa(version: number, playerId: number | null) {
  return playerId == null
    ? undefined
    : db.prepare(`SELECT * FROM sofifa_players WHERE fifa_version = ? AND player_id = ?`).get(version, playerId)
}

const createSchema = z.object({
  name: z.string().min(1),
  // sem teto: os testes usam versões fictícias (9998/9999), como em game-data.test.ts
  fifaVersion: z.number().int().min(15),
  teamType: z.enum(['existing', 'created']),
  sofifaTeamId: z.number().int().optional(),
  createdTeamName: z.string().optional(),
  createdTeamBudgetEur: z.number().optional(),
  createdTeamLeague: z.string().optional(),
  replacedTeamId: z.number().int().optional(),
  objectives: z.array(z.string()).optional(),
  squadQuality: z.string().optional(),
  currentSeason: z.string().min(1),
})

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  currentSeason: z.string().min(1).optional(),
  currentDateIngame: z.string().optional(),
  // marcação de cumprido/pendente por objetivo (hub de desenvolvimento, v0.4.000)
  objectives: z.array(z.object({ text: z.string(), done: z.boolean() })).optional(),
})

export function careerRoutes(app: FastifyInstance) {
  app.get('/api/careers', { preHandler: [mustBeUser] }, (req) => {
    const rows = db.prepare(`SELECT * FROM careers WHERE user_id = ? ORDER BY id DESC`).all(req.user!.id) as CareerRow[]
    const countStmt = db.prepare(`SELECT COUNT(*) AS c FROM career_players WHERE career_id = ?`)
    return {
      careers: rows.map((r) => ({
        ...hydrateCareer(r),
        playerCount: (countStmt.get(r.id) as { c: number }).c,
      })),
    }
  })

  app.post('/api/careers', { preHandler: [mustBeUser] }, (req, reply) => {
    const parsed = createSchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'Dados inválidos.' })
    const input = parsed.data
    if (input.teamType === 'created' && input.fifaVersion < CREATE_CLUB_MIN_VERSION) {
      return reply.code(400).send({ error: 'Criar clube só existe do FIFA 22 em diante.' })
    }
    if (input.teamType === 'existing' && !input.sofifaTeamId) {
      return reply.code(400).send({ error: 'Selecione o time original do jogo.' })
    }

    const result = db.transaction(() => {
      const res = db.prepare(
        `INSERT INTO careers (user_id, name, fifa_version, team_type, sofifa_team_id, created_team_name,
           created_team_budget_eur, created_team_league, replaced_team_id, objectives, squad_quality, current_season)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        req.user!.id, input.name, input.fifaVersion, input.teamType, input.sofifaTeamId ?? null,
        input.createdTeamName ?? null, input.createdTeamBudgetEur ?? null, input.createdTeamLeague ?? null,
        input.replacedTeamId ?? null, input.objectives ? JSON.stringify(input.objectives) : null,
        input.squadQuality ?? null, input.currentSeason,
      )
      const careerId = Number(res.lastInsertRowid)

      // elenco original completo — cópia dos dados reais, nunca editados
      let squadLoaded = 0
      if (input.teamType === 'existing' && input.sofifaTeamId) {
        const squad = db.prepare(
          `SELECT player_id, short_name, positions, age, overall, potential, club_jersey_number, club_loaned_from
           FROM sofifa_players WHERE fifa_version = ? AND club_team_id = ? ORDER BY overall DESC`,
        ).all(input.fifaVersion, input.sofifaTeamId) as Array<{
          player_id: number; short_name: string; positions: string; age: number
          overall: number; potential: number; club_jersey_number: number | null; club_loaned_from: string | null
        }>
        const ins = db.prepare(
          `INSERT INTO career_players (career_id, origin, sofifa_player_id, name, positions, age,
             overall_original, potential_original, jersey_number, status, in_squad)
           VALUES (?, 'sofifa', ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        )
        for (const p of squad) {
          ins.run(careerId, p.player_id, p.short_name, p.positions, p.age, p.overall, p.potential,
            p.club_jersey_number, p.club_loaned_from ? 'emprestado' : 'elenco')
          squadLoaded++
        }
      }
      return { id: careerId, squadLoaded }
    })()
    return result
  })

  app.get<{ Params: { id: string } }>('/api/careers/:id', { preHandler: [mustBeUser] }, (req, reply) => {
    const row = getOwnedCareer(req.user!.id, Number(req.params.id))
    if (!row) return reply.code(404).send({ error: 'Carreira não encontrada' })
    return { career: hydrateCareer(row) }
  })

  app.patch<{ Params: { id: string } }>('/api/careers/:id', { preHandler: [mustBeUser] }, (req, reply) => {
    const parsed = patchSchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'Dados inválidos.' })
    const row = getOwnedCareer(req.user!.id, Number(req.params.id))
    if (!row) return reply.code(404).send({ error: 'Carreira não encontrada' })
    const p = parsed.data
    db.prepare(
      `UPDATE careers SET
         name = COALESCE(?, name),
         current_season = COALESCE(?, current_season),
         current_date_ingame = COALESCE(?, current_date_ingame),
         objectives = COALESCE(?, objectives)
       WHERE id = ?`,
    ).run(
      p.name ?? null, p.currentSeason ?? null, p.currentDateIngame ?? null,
      p.objectives ? JSON.stringify(p.objectives) : null, row.id,
    )
    return { updated: 1 }
  })

  app.delete<{ Params: { id: string } }>('/api/careers/:id', { preHandler: [mustBeUser] }, (req, reply) => {
    const row = getOwnedCareer(req.user!.id, Number(req.params.id))
    if (!row) return reply.code(404).send({ error: 'Carreira não encontrada' })
    db.prepare(`DELETE FROM careers WHERE id = ?`).run(row.id) // cascade: players/snapshots/prospects
    return { deleted: 1 }
  })
}
