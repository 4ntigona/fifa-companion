import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify from 'fastify'
import { gameDataRoutes } from './game-data.js'
import { db } from '../db/index.js'

// A suíte roda numa base efêmera via DATA_DIR (ver server/vitest.config.ts) — o fifa_version
// fictício só evita colisão com outros testes na mesma suíte (ex.: isolation.test.ts).
const V = 9999

function buildApp() {
  const app = Fastify()
  gameDataRoutes(app)
  return app
}

function insertPlayer(overrides: Partial<{
  player_id: number; short_name: string; overall: number; potential: number
  age: number; league_name: string | null; nationality_name: string | null; value_eur: number | null
}>) {
  const p = {
    player_id: 1, short_name: 'Jogador Teste', long_name: 'Jogador Teste Completo',
    positions: 'ST', overall: 80, potential: 85, value_eur: 1_000_000, wage_eur: 10_000,
    age: 22, club_name: 'Time Teste', league_name: 'Liga Teste', nationality_name: 'Brasil',
    attributes_json: JSON.stringify({ crossing: 70, finishing: 80 }),
    ...overrides,
  }
  db.prepare(
    `INSERT INTO sofifa_players (fifa_version, player_id, short_name, long_name, positions, overall, potential, value_eur, wage_eur, age, club_name, league_name, nationality_name, attributes_json)
     VALUES (@fifa_version, @player_id, @short_name, @long_name, @positions, @overall, @potential, @value_eur, @wage_eur, @age, @club_name, @league_name, @nationality_name, @attributes_json)`,
  ).run({ fifa_version: V, ...p })
}

beforeEach(() => {
  db.prepare(`DELETE FROM sofifa_players WHERE fifa_version = ?`).run(V)
})
afterEach(() => {
  db.prepare(`DELETE FROM sofifa_players WHERE fifa_version = ?`).run(V)
})

describe('GET /api/players/:version — projeção e total', () => {
  it('a busca não inclui attributes_json (nem outros campos fora da projeção)', async () => {
    insertPlayer({ player_id: 1 })
    const app = buildApp()
    const res = await app.inject({ method: 'GET', url: `/api/players/${V}` })
    expect(res.statusCode).toBe(200)
    const { players } = res.json()
    expect(players).toHaveLength(1)
    expect(players[0]).not.toHaveProperty('attributes_json')
    expect(players[0]).not.toHaveProperty('_total')
    expect(players[0]).toMatchObject({ player_id: 1, short_name: 'Jogador Teste' })
  })

  it('total (via COUNT OVER()) reflete os filtros aplicados, não o total sem filtro', async () => {
    insertPlayer({ player_id: 1, overall: 90 })
    insertPlayer({ player_id: 2, overall: 60 })
    const app = buildApp()
    const res = await app.inject({ method: 'GET', url: `/api/players/${V}?minOverall=80` })
    const { players, total } = res.json()
    expect(players).toHaveLength(1)
    expect(total).toBe(1)
  })

  it('total é 0 quando nenhum jogador atende ao filtro', async () => {
    insertPlayer({ player_id: 1, overall: 60 })
    const app = buildApp()
    const res = await app.inject({ method: 'GET', url: `/api/players/${V}?minOverall=99` })
    const { players, total } = res.json()
    expect(players).toHaveLength(0)
    expect(total).toBe(0)
  })
})

describe('GET /api/player/:version/:playerId — reidratação completa', () => {
  it('traz attributes_json (usado pela tela do jogador após contratar)', async () => {
    insertPlayer({ player_id: 7 })
    const app = buildApp()
    const res = await app.inject({ method: 'GET', url: `/api/player/${V}/7` })
    expect(res.statusCode).toBe(200)
    const { player } = res.json()
    expect(player).toHaveProperty('attributes_json')
    expect(JSON.parse(player.attributes_json)).toMatchObject({ finishing: 80 })
  })
})
