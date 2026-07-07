import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../db/index.js'
import { CREATE_CLUB_MIN_VERSION } from '../sofifa/source.js'

const careerSchema = z.object({
  name: z.string().min(1),
  fifaVersion: z.number().int().min(14).max(26),
  teamType: z.enum(['existing', 'created']),
  sofifaTeamId: z.number().int().optional(),
  createdTeamName: z.string().optional(),
  createdTeamBudgetEur: z.number().int().optional(),
  createdTeamLeague: z.string().optional(),
  replacedTeamId: z.number().int().optional(),
  objectives: z.array(z.string()).optional(),
  squadQuality: z.string().optional(),
  currentSeason: z.string().min(4),
  currentDateIngame: z.string().optional(),
})

export function careerRoutes(app: FastifyInstance) {
  app.get('/api/careers', () => {
    const careers = db.prepare(`SELECT * FROM careers ORDER BY created_at DESC`).all() as any[]
    for (const c of careers) {
      if (c.sofifa_team_id) {
        c.team = db.prepare(`SELECT * FROM sofifa_teams WHERE fifa_version = ? AND team_id = ?`)
          .get(c.fifa_version, c.sofifa_team_id)
      }
      c.playerCount = (db.prepare(`SELECT COUNT(*) AS c FROM career_players WHERE career_id = ?`).get(c.id) as any).c
    }
    return { careers }
  })

  app.post('/api/careers', (req, reply) => {
    const body = careerSchema.parse(req.body)
    if (body.teamType === 'created' && body.fifaVersion < CREATE_CLUB_MIN_VERSION) {
      return reply.code(400).send({ error: `Criar clube só existe do FIFA ${CREATE_CLUB_MIN_VERSION} em diante.` })
    }
    if (body.teamType === 'existing' && !body.sofifaTeamId) {
      return reply.code(400).send({ error: 'Selecione o time original do jogo.' })
    }

    const res = db.prepare(`
      INSERT INTO careers (name, fifa_version, team_type, sofifa_team_id, created_team_name,
        created_team_budget_eur, created_team_league, replaced_team_id, objectives, squad_quality,
        current_season, current_date_ingame)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      body.name, body.fifaVersion, body.teamType, body.sofifaTeamId ?? null,
      body.createdTeamName ?? null, body.createdTeamBudgetEur ?? null, body.createdTeamLeague ?? null,
      body.replacedTeamId ?? null, body.objectives ? JSON.stringify(body.objectives) : null,
      body.squadQuality ?? null, body.currentSeason, body.currentDateIngame ?? null,
    )
    const careerId = Number(res.lastInsertRowid)

    // Time original: carrega automaticamente o ELENCO COMPLETO da database real.
    let loaded = 0
    if (body.teamType === 'existing' && body.sofifaTeamId) {
      const squad = db.prepare(
        `SELECT * FROM sofifa_players WHERE fifa_version = ? AND club_team_id = ? ORDER BY overall DESC`,
      ).all(body.fifaVersion, body.sofifaTeamId) as any[]
      const ins = db.prepare(`
        INSERT INTO career_players (career_id, origin, sofifa_player_id, name, positions, age,
          overall_original, potential_original, jersey_number, status, in_squad)
        VALUES (?,?,?,?,?,?,?,?,?,?,1)
      `)
      db.transaction(() => {
        for (const p of squad) {
          const status = p.club_loaned_from ? 'emprestado' : 'elenco'
          ins.run(careerId, 'sofifa', p.player_id, p.short_name, p.positions, p.age,
            p.overall, p.potential, p.club_jersey_number, status)
          loaded++
        }
      })()
    }

    return { id: careerId, squadLoaded: loaded }
  })

  app.get<{ Params: { id: string } }>('/api/careers/:id', (req, reply) => {
    const career = db.prepare(`SELECT * FROM careers WHERE id = ?`).get(Number(req.params.id)) as any
    if (!career) return reply.code(404).send({ error: 'Carreira não encontrada' })
    if (career.sofifa_team_id) {
      career.team = db.prepare(`SELECT * FROM sofifa_teams WHERE fifa_version = ? AND team_id = ?`)
        .get(career.fifa_version, career.sofifa_team_id)
    }
    if (career.replaced_team_id) {
      career.replacedTeam = db.prepare(`SELECT * FROM sofifa_teams WHERE fifa_version = ? AND team_id = ?`)
        .get(career.fifa_version, career.replaced_team_id)
    }
    return { career }
  })

  app.patch<{ Params: { id: string } }>('/api/careers/:id', (req) => {
    const body = careerSchema.partial().parse(req.body)
    const sets: string[] = []
    const params: unknown[] = []
    const map: Record<string, string> = {
      name: 'name', currentSeason: 'current_season', currentDateIngame: 'current_date_ingame',
      createdTeamName: 'created_team_name', createdTeamBudgetEur: 'created_team_budget_eur',
      createdTeamLeague: 'created_team_league', replacedTeamId: 'replaced_team_id',
      squadQuality: 'squad_quality',
    }
    for (const [key, col] of Object.entries(map)) {
      const v = (body as any)[key]
      if (v !== undefined) { sets.push(`${col} = ?`); params.push(v) }
    }
    if (body.objectives !== undefined) { sets.push('objectives = ?'); params.push(JSON.stringify(body.objectives)) }
    if (!sets.length) return { updated: 0 }
    params.push(Number(req.params.id))
    const res = db.prepare(`UPDATE careers SET ${sets.join(', ')} WHERE id = ?`).run(...params)
    return { updated: res.changes }
  })

  app.delete<{ Params: { id: string } }>('/api/careers/:id', (req) => {
    const res = db.prepare(`DELETE FROM careers WHERE id = ?`).run(Number(req.params.id))
    return { deleted: res.changes }
  })
}
