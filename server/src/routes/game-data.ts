import type { FastifyInstance } from 'fastify'
import { db } from '../db/index.js'
import { CREATE_CLUB_MIN_VERSION, KNOWN_VERSIONS } from '../sofifa/source.js'

// Colunas usadas pela lista de busca (Prospects.tsx) — não inclui attributes_json nem os
// atributos individuais (pace/shooting/…), que só a reidratação de /api/player traz.
const LIST_COLS = 'fifa_version, player_id, short_name, long_name, positions, overall, potential, value_eur, wage_eur, age, club_name, league_name, nationality_name'

/** Rotas de leitura da database original do jogo (espelho local, dados reais). */
export function gameDataRoutes(app: FastifyInstance) {
  app.get('/api/versions', () => {
    const imported = db
      .prepare(`SELECT fifa_version AS v, COUNT(*) AS players FROM sofifa_players GROUP BY fifa_version`)
      .all() as { v: number; players: number }[]
    const byVersion = new Map(imported.map((r) => [r.v, r.players]))
    return {
      versions: KNOWN_VERSIONS.map((v) => ({
        fifaVersion: v,
        label: v <= 23 ? `FIFA ${v}` : `FC ${v}`,
        imported: byVersion.has(v),
        playerCount: byVersion.get(v) ?? 0,
        createClub: v >= CREATE_CLUB_MIN_VERSION,
      })),
    }
  })

  // Ligas agrupadas por país (país = nacionalidade predominante dos times da liga,
  // para lidar com casos como a MLS, que tem times dos EUA e do Canadá).
  app.get<{ Params: { version: string } }>('/api/leagues/:version', (req) => {
    const rows = db
      .prepare(
        `SELECT league_id, league_name, MIN(league_level) AS league_level,
                nationality_name, COUNT(*) AS team_count
         FROM sofifa_teams
         WHERE fifa_version = ? AND league_name IS NOT NULL
           AND league_name != 'Friendly International' -- seleções não entram no modo carreira
         GROUP BY league_id, league_name, nationality_name`,
      )
      .all(Number(req.params.version)) as {
        league_id: number | null; league_name: string; league_level: number | null
        nationality_name: string | null; team_count: number
      }[]

    // nacionalidade predominante por liga
    const byLeague = new Map<string, { id: number | null; name: string; level: number | null; country: string; countryTeams: number; teams: number }>()
    for (const r of rows) {
      const key = `${r.league_id}|${r.league_name}`
      const country = r.nationality_name ?? 'Outros'
      const cur = byLeague.get(key)
      if (!cur) {
        byLeague.set(key, { id: r.league_id, name: r.league_name, level: r.league_level, country, countryTeams: r.team_count, teams: r.team_count })
      } else {
        cur.teams += r.team_count
        if (r.team_count > cur.countryTeams) { cur.country = country; cur.countryTeams = r.team_count }
      }
    }

    const countries = new Map<string, { country: string; leagues: { id: number | null; name: string; level: number | null; teams: number }[] }>()
    for (const l of byLeague.values()) {
      if (!countries.has(l.country)) countries.set(l.country, { country: l.country, leagues: [] })
      countries.get(l.country)!.leagues.push({ id: l.id, name: l.name, level: l.level, teams: l.teams })
    }
    const list = [...countries.values()]
      .map((c) => ({ ...c, leagues: c.leagues.sort((a, b) => (a.level ?? 9) - (b.level ?? 9) || a.name.localeCompare(b.name)) }))
      .sort((a, b) => a.country.localeCompare(b.country))
    return { countries: list }
  })

  app.get<{ Params: { version: string }; Querystring: { league?: string; leagueId?: string; q?: string } }>(
    '/api/teams/:version',
    (req) => {
      const { league, leagueId, q } = req.query
      const conds = ['fifa_version = ?', `(league_name IS NULL OR league_name != 'Friendly International')`]
      const params: unknown[] = [Number(req.params.version)]
      if (leagueId) { conds.push('league_id = ?'); params.push(Number(leagueId)) }
      else if (league) { conds.push('league_name = ?'); params.push(league) }
      if (q) { conds.push('team_name LIKE ?'); params.push(`%${q}%`) }
      const rows = db
        .prepare(`SELECT * FROM sofifa_teams WHERE ${conds.join(' AND ')} ORDER BY overall DESC LIMIT 100`)
        .all(...params)
      return { teams: rows }
    },
  )

  app.get<{ Params: { version: string; teamId: string } }>('/api/team/:version/:teamId', (req) => {
    const version = Number(req.params.version)
    const teamId = Number(req.params.teamId)
    const team = db.prepare(`SELECT * FROM sofifa_teams WHERE fifa_version = ? AND team_id = ?`).get(version, teamId)
    const players = db
      .prepare(`SELECT * FROM sofifa_players WHERE fifa_version = ? AND club_team_id = ? ORDER BY overall DESC`)
      .all(version, teamId)
    return { team, players }
  })

  app.get<{
    Params: { version: string }
    Querystring: {
      q?: string; position?: string; minAge?: string; maxAge?: string
      minOverall?: string; maxOverall?: string; minPotential?: string
      maxValue?: string; league?: string; nationality?: string
      sort?: string; limit?: string; offset?: string
    }
  }>('/api/players/:version', (req) => {
    const {
      q, position, minAge, maxAge, minOverall, maxOverall, minPotential,
      maxValue, league, nationality, sort, limit, offset,
    } = req.query
    const conds = ['fifa_version = ?']
    const params: unknown[] = [Number(req.params.version)]
    if (q) { conds.push('(short_name LIKE ? OR long_name LIKE ?)'); params.push(`%${q}%`, `%${q}%`) }
    if (position) { conds.push(`(',' || REPLACE(positions, ' ', '') || ',') LIKE ?`); params.push(`%,${position},%`) }
    if (minAge) { conds.push('age >= ?'); params.push(Number(minAge)) }
    if (maxAge) { conds.push('age <= ?'); params.push(Number(maxAge)) }
    if (minOverall) { conds.push('overall >= ?'); params.push(Number(minOverall)) }
    if (maxOverall) { conds.push('overall <= ?'); params.push(Number(maxOverall)) }
    if (minPotential) { conds.push('potential >= ?'); params.push(Number(minPotential)) }
    if (maxValue) { conds.push('value_eur <= ?'); params.push(Number(maxValue)) }
    if (league) { conds.push('league_name = ?'); params.push(league) }
    if (nationality) { conds.push('nationality_name = ?'); params.push(nationality) }

    const sortMap: Record<string, string> = {
      overall: 'overall DESC', potential: 'potential DESC',
      growth: '(potential - overall) DESC', age: 'age ASC', value: 'value_eur DESC',
    }
    const orderBy = sortMap[sort ?? ''] ?? 'potential DESC'
    const lim = Math.min(Number(limit ?? 50), 200)
    const off = Number(offset ?? 0)

    const where = conds.join(' AND ')
    // COUNT(*) OVER() traz o total na mesma query — evita um segundo full-scan a cada "carregar mais".
    const rows = db
      .prepare(`SELECT ${LIST_COLS}, COUNT(*) OVER() AS _total FROM sofifa_players WHERE ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`)
      .all(...params, lim, off) as Array<Record<string, unknown> & { _total: number }>
    const total = rows[0]?._total ?? 0
    const players = rows.map(({ _total, ...p }) => p)
    return { players, total }
  })

  app.get<{ Params: { version: string; playerId: string } }>('/api/player/:version/:playerId', (req) => {
    const player = db
      .prepare(`SELECT * FROM sofifa_players WHERE fifa_version = ? AND player_id = ?`)
      .get(Number(req.params.version), Number(req.params.playerId))
    return { player }
  })
}
