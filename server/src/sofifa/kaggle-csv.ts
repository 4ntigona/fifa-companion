/**
 * Importador dos dumps reais da database do jogo (extraídos do SoFIFA).
 *
 * Dataset: stefanoleone992/ea-sports-fc-24-complete-player-dataset (Kaggle)
 *   - male_players.csv: todos os jogadores, FIFA 15 → FC 24, com fifa_version e
 *     fifa_update. Importamos o MENOR fifa_update de cada versão (database de
 *     lançamento — a que o modo carreira usa).
 *   - male_teams.csv: todos os times com ratings/verba reais, mesmas versões.
 *
 * Nenhum dado é inventado ou reduzido: colunas conhecidas viram colunas tipadas,
 * todas as demais são preservadas em attributes_json/extra_json.
 */
import { createReadStream, existsSync } from 'node:fs'
import { join } from 'node:path'
import readline from 'node:readline'
import { parse } from 'csv-parse'
import { db, DATA_DIR } from '../db/index.js'

export const KAGGLE_DIR = join(DATA_DIR, 'kaggle')
export const PLAYERS_CSV = join(KAGGLE_DIR, 'male_players.csv')
export const TEAMS_CSV = join(KAGGLE_DIR, 'male_teams.csv')
export const DATASET = 'stefanoleone992/ea-sports-fc-24-complete-player-dataset'

const PLAYER_COLS = [
  'short_name', 'long_name', 'player_positions', 'overall', 'potential', 'value_eur', 'wage_eur',
  'age', 'dob', 'height_cm', 'weight_kg', 'club_team_id', 'club_name', 'league_name', 'league_level',
  'club_position', 'club_jersey_number', 'club_loaned_from', 'club_joined_date', 'club_contract_valid_until_year',
  'nationality_name', 'preferred_foot', 'weak_foot', 'skill_moves', 'international_reputation',
  'work_rate', 'body_type', 'player_tags', 'player_traits',
  'pace', 'shooting', 'passing', 'dribbling', 'defending', 'physic',
] as const

const TEAM_COLS = [
  'team_name', 'league_id', 'league_name', 'league_level', 'nationality_name',
  'overall', 'attack', 'midfield', 'defence', 'transfer_budget_eur', 'club_worth_eur',
  'international_prestige', 'domestic_prestige', 'rival_team',
] as const

function num(v: string | undefined): number | null {
  if (v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function csvFilesPresent(): { players: boolean; teams: boolean } {
  return { players: existsSync(PLAYERS_CSV), teams: existsSync(TEAMS_CSV) }
}

/** Descobre o menor fifa_update por versão presente no CSV (primeira passada, só 2 colunas). */
async function launchUpdates(csvPath: string): Promise<Map<number, number>> {
  const map = new Map<number, number>()
  const rl = readline.createInterface({
    input: createReadStream(csvPath),
    crlfDelay: Infinity,
  })

  let isHeader = true
  let verIdx = -1
  let updIdx = -1

  for await (const line of rl) {
    if (isHeader) {
      const cols = line.split(',')
      verIdx = cols.indexOf('fifa_version')
      updIdx = cols.indexOf('fifa_update')
      isHeader = false
      continue
    }
    // Extract first columns by simple splitting (since version and update are numbers near start)
    const cols = line.split(',', Math.max(verIdx, updIdx) + 2)
    const v = Number(cols[verIdx])
    const u = Number(cols[updIdx])
    if (!Number.isFinite(v) || !Number.isFinite(u)) continue
    const cur = map.get(v)
    if (cur === undefined || u < cur) map.set(v, u)
  }
  return map
}

/**
 * Nas versões históricas do dump, os PARES (league_id, league_name/level) vêm embaralhados
 * entre linhas (bug do dataset); o league_id em si é correto. A versão mais recente do
 * arquivo (FC 24, base do dataset) é limpa. Derivamos daí o nome/nível canônico por
 * league_id — e, para ligas que não existem mais nela, usamos a moda global. Nenhum
 * nome é inventado: tudo sai do próprio arquivo.
 */
function canonicalLeagues(teamRowsArray: Record<string, any>[]): Map<number, { name: string; level: number | null }> {
  interface Stat {
    maxVersion: number
    atMax: Map<string, number>        // "name|level" → contagem na maxVersion
    global: Map<string, number>       // "name|level" → contagem geral
  }
  const stats = new Map<number, Stat>()
  let fileMaxVersion = 0

  for (const row of teamRowsArray) {
    const id = Number(row.league_id)
    const v = Number(row.fifa_version)
    const name = row.league_name
    if (!Number.isFinite(id) || !name) continue
    if (v > fileMaxVersion) fileMaxVersion = v
    const key = `${name}|${row.league_level ?? ''}`
    let s = stats.get(id)
    if (!s) { s = { maxVersion: v, atMax: new Map(), global: new Map() }; stats.set(id, s) }
    if (v > s.maxVersion) { s.maxVersion = v; s.atMax = new Map() }
    if (v === s.maxVersion) s.atMax.set(key, (s.atMax.get(key) ?? 0) + 1)
    s.global.set(key, (s.global.get(key) ?? 0) + 1)
  }

  const mode = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  const result = new Map<number, { name: string; level: number | null }>()
  for (const [id, s] of stats) {
    const key = s.maxVersion === fileMaxVersion ? mode(s.atMax) : mode(s.global)
    if (!key) continue
    const [name, level] = [key.slice(0, key.lastIndexOf('|')), key.slice(key.lastIndexOf('|') + 1)]
    result.set(id, { name, level: level === '' ? null : Number(level) })
  }
  return result
}

export interface ImportProgress {
  phase: 'preparando' | 'times' | 'jogadores' | 'concluído'
  version?: number
  rows: number
}

export async function importFromCsv(
  versions: number[],
  onProgress: (p: ImportProgress) => void,
): Promise<{ players: number; teams: number }> {
  const present = csvFilesPresent()
  if (!present.players || !present.teams) {
    throw new Error(
      `Arquivos do dataset não encontrados em ${KAGGLE_DIR}. ` +
      `Baixe male_players.csv e male_teams.csv do dataset ${DATASET} (Kaggle).`,
    )
  }

  onProgress({ phase: 'preparando', rows: 0 })
  const playerLaunch = await launchUpdates(PLAYERS_CSV)

  // 1. Read teams once
  const teamRowsArray: Record<string, any>[] = []
  const teamParser = createReadStream(TEAMS_CSV).pipe(parse({ columns: true, relaxQuotes: true }))
  for await (const row of teamParser) {
    teamRowsArray.push(row)
  }

  // 2. Compute min updates for teams in-memory
  const teamLaunch = new Map<number, number>()
  for (const row of teamRowsArray) {
    const v = Number(row.fifa_version)
    const u = Number(row.fifa_update)
    if (!Number.isFinite(v) || !Number.isFinite(u)) continue
    const cur = teamLaunch.get(v)
    if (cur === undefined || u < cur) teamLaunch.set(v, u)
  }

  // 3. Compute canonical leagues in-memory
  const leagues = canonicalLeagues(teamRowsArray)

  const wanted = new Set(versions)
  let teamRows = 0
  let playerRows = 0

  // ---- times ----
  const insertTeam = db.prepare(`
    INSERT OR REPLACE INTO sofifa_teams (
      fifa_version, team_id, team_name, league_id, league_name, league_level, nationality_name,
      overall, attack, midfield, defence, transfer_budget_eur, club_worth_eur,
      star_rating, international_prestige, domestic_prestige, youth_development, rival_team, extra_json
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `)
  {
    const teamsToInsert = teamRowsArray.filter(
      (row) => wanted.has(Number(row.fifa_version)) && Number(row.fifa_update) === teamLaunch.get(Number(row.fifa_version))
    )
    flushTeams(teamsToInsert, insertTeam)
    teamRows = teamsToInsert.length
    onProgress({ phase: 'times', rows: teamRows })
  }

  // ---- jogadores ----
  const insertPlayer = db.prepare(`
    INSERT OR REPLACE INTO sofifa_players (
      fifa_version, player_id, short_name, long_name, positions, overall, potential, value_eur, wage_eur,
      age, dob, height_cm, weight_kg, club_team_id, club_name, league_name, league_level, club_position,
      club_jersey_number, club_loaned_from, club_joined, club_contract_valid_until, nationality_name,
      preferred_foot, weak_foot, skill_moves, international_reputation, work_rate, body_type,
      player_tags, player_traits, pace, shooting, passing, dribbling, defending, physic, attributes_json
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `)
  {
    const parser = createReadStream(PLAYERS_CSV).pipe(parse({ columns: true, relaxQuotes: true }))
    const tx: Record<string, unknown>[] = []
    for await (const row of parser) {
      const v = Number(row.fifa_version)
      if (!wanted.has(v) || Number(row.fifa_update) !== playerLaunch.get(v)) continue
      tx.push(row)
      if (tx.length >= 2000) { flushPlayers(tx, insertPlayer); playerRows += tx.length; tx.length = 0; onProgress({ phase: 'jogadores', rows: playerRows }) }
    }
    if (tx.length) { flushPlayers(tx, insertPlayer); playerRows += tx.length }
  }

  // ---- correção dos nomes de liga (pares embaralhados no dump histórico) ----
  {
    const fixTeam = db.prepare(
      `UPDATE sofifa_teams SET league_name = ?, league_level = ? WHERE league_id = ? AND fifa_version = ?`,
    )
    db.transaction(() => {
      for (const v of versions) {
        for (const [id, l] of leagues) fixTeam.run(l.name, l.level, id, v)
      }
      // jogadores herdam a liga canônica do próprio clube
      for (const v of versions) {
        db.prepare(`
          UPDATE sofifa_players SET
            league_name = (SELECT t.league_name FROM sofifa_teams t
                           WHERE t.fifa_version = sofifa_players.fifa_version AND t.team_id = sofifa_players.club_team_id),
            league_level = (SELECT t.league_level FROM sofifa_teams t
                            WHERE t.fifa_version = sofifa_players.fifa_version AND t.team_id = sofifa_players.club_team_id)
          WHERE fifa_version = ? AND club_team_id IS NOT NULL
            AND EXISTS (SELECT 1 FROM sofifa_teams t
                        WHERE t.fifa_version = sofifa_players.fifa_version AND t.team_id = sofifa_players.club_team_id)
        `).run(v)
      }
    })()
  }

  onProgress({ phase: 'concluído', rows: playerRows })
  return { players: playerRows, teams: teamRows }
}

function flushTeams(rows: Record<string, any>[], stmt: import('better-sqlite3').Statement<unknown[], unknown>) {
  db.transaction(() => {
    for (const r of rows) {
      const known = new Set([...TEAM_COLS, 'fifa_version', 'fifa_update', 'fifa_update_date', 'team_id', 'team_url'])
      const extra: Record<string, unknown> = {}
      for (const [k, val] of Object.entries(r)) if (!known.has(k) && val !== '') extra[k] = val
      stmt.run(
        Number(r.fifa_version), Number(r.team_id), r.team_name,
        num(r.league_id), r.league_name || null, num(r.league_level), r.nationality_name || null,
        num(r.overall), num(r.attack), num(r.midfield), num(r.defence),
        num(r.transfer_budget_eur), num(r.club_worth_eur),
        null, num(r.international_prestige), num(r.domestic_prestige), null, num(r.rival_team),
        JSON.stringify(extra),
      )
    }
  })()
}

function flushPlayers(rows: Record<string, any>[], stmt: import('better-sqlite3').Statement<unknown[], unknown>) {
  db.transaction(() => {
    for (const r of rows) {
      const known = new Set([...PLAYER_COLS, 'fifa_version', 'fifa_update', 'fifa_update_date', 'player_id', 'sofifa_id', 'player_url', 'update_as_of', 'club_joined', 'club_contract_valid_until'])
      const attrs: Record<string, unknown> = {}
      for (const [k, val] of Object.entries(r)) if (!known.has(k) && val !== '') attrs[k] = val
      stmt.run(
        Number(r.fifa_version), Number(r.player_id ?? r.sofifa_id), r.short_name, r.long_name, r.player_positions,
        num(r.overall), num(r.potential), num(r.value_eur), num(r.wage_eur),
        num(r.age), r.dob || null, num(r.height_cm), num(r.weight_kg),
        num(r.club_team_id), r.club_name || null, r.league_name || null, num(r.league_level),
        r.club_position || null, num(r.club_jersey_number), r.club_loaned_from || null,
        (r.club_joined_date ?? r.club_joined) || null, num(r.club_contract_valid_until_year ?? r.club_contract_valid_until), r.nationality_name || null,
        r.preferred_foot || null, num(r.weak_foot), num(r.skill_moves), num(r.international_reputation),
        r.work_rate || null, r.body_type || null, r.player_tags || null, r.player_traits || null,
        num(r.pace), num(r.shooting), num(r.passing), num(r.dribbling), num(r.defending), num(r.physic),
        JSON.stringify(attrs),
      )
    }
  })()
}
