import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import { authPlugin } from '../auth/plugin.js'
import { hashPassword } from '../auth/passwords.js'
import { createSession } from '../auth/sessions.js'
import { careerRoutes } from './careers.js'
import { careerPlayerRoutes } from './career-players.js'
import { prospectRoutes } from './prospects.js'
import { importLocalRoutes } from './import-local.js'
import { db } from '../db/index.js'

// Fixtures na versão fictícia 9998 — não colide com dados reais nem com game-data.test.ts (9999).
const V = 9998

async function buildApp() {
  const app = Fastify()
  await app.register(cookie)
  authPlugin(app)
  careerRoutes(app)
  careerPlayerRoutes(app)
  prospectRoutes(app)
  importLocalRoutes(app)
  return app
}

function makeUser(email: string): { id: number; sid: string } {
  const { salt, hash } = hashPassword('senha-de-teste-1')
  const res = db.prepare(`INSERT INTO users (email, password_hash, salt) VALUES (?, ?, ?)`).run(email, hash, salt)
  const id = Number(res.lastInsertRowid)
  return { id, sid: createSession(id) }
}

beforeAll(() => {
  db.prepare(`DELETE FROM sofifa_players WHERE fifa_version = ?`).run(V)
  db.prepare(`DELETE FROM sofifa_teams WHERE fifa_version = ?`).run(V)
  db.prepare(
    `INSERT INTO sofifa_teams (fifa_version, team_id, team_name, league_name, overall) VALUES (?, 10, 'Test FC', 'Liga Teste', 80)`,
  ).run(V)
  const ins = db.prepare(
    `INSERT INTO sofifa_players (fifa_version, player_id, short_name, long_name, positions, overall, potential, age, club_team_id, club_jersey_number, attributes_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}')`,
  )
  ins.run(V, 101, 'A. Atacante', 'Alfa Atacante', 'ST', 82, 90, 19, 10, 9)
  ins.run(V, 102, 'B. Beque', 'Beto Beque', 'CB', 78, 84, 24, 10, 4)
  ins.run(V, 201, 'C. Craque', 'Caio Craque', 'CAM', 88, 93, 21, 99, 10) // de outro clube (prospecto)
})

beforeEach(() => {
  db.prepare(`DELETE FROM careers`).run() // cascade limpa players/snapshots/prospects
  db.prepare(`DELETE FROM sessions`).run()
  db.prepare(`DELETE FROM users`).run()
})

describe('carreiras (/api/careers)', () => {
  it('exige sessão (401 sem cookie)', async () => {
    const app = await buildApp()
    expect((await app.inject({ method: 'GET', url: '/api/careers' })).statusCode).toBe(401)
  })

  it('cria carreira de time existente carregando o elenco real, lista e lê com hidratação', async () => {
    const app = await buildApp()
    const { sid } = makeUser('a@example.com')

    const created = await app.inject({
      method: 'POST', url: '/api/careers', cookies: { sid },
      payload: { name: 'Minha carreira', fifaVersion: V, teamType: 'existing', sofifaTeamId: 10, currentSeason: '2015/16' },
    })
    expect(created.statusCode).toBe(200)
    expect(created.json().squadLoaded).toBe(2)
    const careerId = created.json().id

    const list = await app.inject({ method: 'GET', url: '/api/careers', cookies: { sid } })
    expect(list.json().careers).toHaveLength(1)
    expect(list.json().careers[0].playerCount).toBe(2)
    expect(list.json().careers[0].team.team_name).toBe('Test FC')

    const players = await app.inject({ method: 'GET', url: `/api/careers/${careerId}/players`, cookies: { sid } })
    const names = players.json().players.map((p: any) => p.name)
    expect(names).toContain('A. Atacante')
    expect(players.json().players[0].sofifa).toBeTruthy() // reidratado da database real
  })

  it('clube criado antes do FIFA 22 é rejeitado', async () => {
    const app = await buildApp()
    const { sid } = makeUser('b@example.com')
    const res = await app.inject({
      method: 'POST', url: '/api/careers', cookies: { sid },
      payload: { name: 'x', fifaVersion: 16, teamType: 'created', createdTeamName: 'Meu FC', currentSeason: '2015/16' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('ISOLAMENTO: usuário B recebe 404 na carreira de A (ler/editar/apagar)', async () => {
    const app = await buildApp()
    const a = makeUser('a@example.com')
    const b = makeUser('b@example.com')
    const created = await app.inject({
      method: 'POST', url: '/api/careers', cookies: { sid: a.sid },
      payload: { name: 'De A', fifaVersion: V, teamType: 'existing', sofifaTeamId: 10, currentSeason: '2015/16' },
    })
    const id = created.json().id

    expect((await app.inject({ method: 'GET', url: `/api/careers/${id}`, cookies: { sid: b.sid } })).statusCode).toBe(404)
    expect((await app.inject({ method: 'PATCH', url: `/api/careers/${id}`, cookies: { sid: b.sid }, payload: { name: 'roubada' } })).statusCode).toBe(404)
    expect((await app.inject({ method: 'DELETE', url: `/api/careers/${id}`, cookies: { sid: b.sid } })).statusCode).toBe(404)
    // lista de B vazia; a de A intacta
    expect((await app.inject({ method: 'GET', url: '/api/careers', cookies: { sid: b.sid } })).json().careers).toHaveLength(0)
    expect((await app.inject({ method: 'GET', url: `/api/careers/${id}`, cookies: { sid: a.sid } })).statusCode).toBe(200)
  })

  it('DELETE em cascata remove jogadores, snapshots e prospectos', async () => {
    const app = await buildApp()
    const { sid } = makeUser('c@example.com')
    const created = await app.inject({
      method: 'POST', url: '/api/careers', cookies: { sid },
      payload: { name: 'x', fifaVersion: V, teamType: 'existing', sofifaTeamId: 10, currentSeason: '2015/16' },
    })
    const id = created.json().id
    await app.inject({ method: 'POST', url: `/api/careers/${id}/prospects`, cookies: { sid }, payload: { sofifaPlayerId: 201 } })

    await app.inject({ method: 'DELETE', url: `/api/careers/${id}`, cookies: { sid } })
    expect((db.prepare(`SELECT COUNT(*) c FROM career_players`).get() as any).c).toBe(0)
    expect((db.prepare(`SELECT COUNT(*) c FROM prospects`).get() as any).c).toBe(0)
  })
})

describe('jogadores da carreira', () => {
  async function setup() {
    const app = await buildApp()
    const { sid } = makeUser('p@example.com')
    const created = await app.inject({
      method: 'POST', url: '/api/careers', cookies: { sid },
      payload: { name: 'x', fifaVersion: V, teamType: 'existing', sofifaTeamId: 10, currentSeason: '2015/16' },
    })
    return { app, sid, careerId: created.json().id as number }
  }

  it('cria jogador manual (base), edita status e adiciona snapshot', async () => {
    const { app, sid, careerId } = await setup()
    const created = await app.inject({
      method: 'POST', url: `/api/careers/${careerId}/players`, cookies: { sid },
      payload: { origin: 'youth', name: 'Joia da Base', positions: 'CM', age: 16, potentialOriginal: 88 },
    })
    expect(created.statusCode).toBe(200)
    const playerId = created.json().id

    const get1 = await app.inject({ method: 'GET', url: `/api/career-players/${playerId}`, cookies: { sid } })
    expect(get1.json().player.status).toBe('base') // default de youth
    expect(get1.json().career.id).toBe(careerId)

    await app.inject({ method: 'PATCH', url: `/api/career-players/${playerId}`, cookies: { sid }, payload: { status: 'elenco', jerseyNumber: 27 } })
    const snap = await app.inject({
      method: 'POST', url: `/api/career-players/${playerId}/snapshots`, cookies: { sid },
      payload: { season: '2016/17', overall: 68, potential: 88 },
    })
    expect(snap.statusCode).toBe(200)

    const get2 = await app.inject({ method: 'GET', url: `/api/career-players/${playerId}`, cookies: { sid } })
    expect(get2.json().player.status).toBe('elenco')
    expect(get2.json().player.jersey_number).toBe(27)
    expect(get2.json().player.snapshots).toHaveLength(1)
  })

  it('capture/apply em lote: cria novos + snapshot em existente, transacional', async () => {
    const { app, sid, careerId } = await setup()
    const players = await app.inject({ method: 'GET', url: `/api/careers/${careerId}/players`, cookies: { sid } })
    const existingId = players.json().players[0].id

    const ok = await app.inject({
      method: 'POST', url: `/api/careers/${careerId}/capture/apply`, cookies: { sid },
      payload: { rows: [
        { target: 'new', origin: 'youth', name: 'Novato 1', positions: 'RW', status: 'base', inSquad: false, snapshot: { season: '2015/16', overall: 62 } },
        { target: 'existing', targetPlayerId: existingId, snapshot: { season: '2015/16', overall: 83 } },
      ] },
    })
    expect(ok.statusCode).toBe(200)
    expect(ok.json().created).toBe(2)

    // lote com alvo inválido falha inteiro (nada gravado)
    const before = (db.prepare(`SELECT COUNT(*) c FROM player_snapshots`).get() as any).c
    const bad = await app.inject({
      method: 'POST', url: `/api/careers/${careerId}/capture/apply`, cookies: { sid },
      payload: { rows: [
        { target: 'new', origin: 'youth', name: 'Não deve entrar', positions: 'ST', status: 'base', inSquad: false },
        { target: 'existing', targetPlayerId: 999999, snapshot: { season: '2015/16', overall: 80 } },
      ] },
    })
    expect(bad.statusCode).toBe(400)
    expect((db.prepare(`SELECT COUNT(*) c FROM player_snapshots`).get() as any).c).toBe(before)
    const names = (db.prepare(`SELECT name FROM career_players WHERE career_id = ?`).all(careerId) as any[]).map((r) => r.name)
    expect(names).not.toContain('Não deve entrar')
  })

  it('ISOLAMENTO: B não acessa jogador de A', async () => {
    const { app, sid, careerId } = await setup()
    const b = makeUser('b2@example.com')
    const players = await app.inject({ method: 'GET', url: `/api/careers/${careerId}/players`, cookies: { sid } })
    const pid = players.json().players[0].id
    expect((await app.inject({ method: 'GET', url: `/api/career-players/${pid}`, cookies: { sid: b.sid } })).statusCode).toBe(404)
    expect((await app.inject({ method: 'DELETE', url: `/api/career-players/${pid}`, cookies: { sid: b.sid } })).statusCode).toBe(404)
  })
})

describe('prospecção', () => {
  async function setup() {
    const app = await buildApp()
    const { sid } = makeUser('s@example.com')
    const created = await app.inject({
      method: 'POST', url: '/api/careers', cookies: { sid },
      payload: { name: 'x', fifaVersion: V, teamType: 'existing', sofifaTeamId: 10, currentSeason: '2015/16' },
    })
    return { app, sid, careerId: created.json().id as number }
  }

  it('adiciona à shortlist (duplicado = 409), lista hidratado', async () => {
    const { app, sid, careerId } = await setup()
    const add = await app.inject({ method: 'POST', url: `/api/careers/${careerId}/prospects`, cookies: { sid }, payload: { sofifaPlayerId: 201 } })
    expect(add.statusCode).toBe(200)
    const dup = await app.inject({ method: 'POST', url: `/api/careers/${careerId}/prospects`, cookies: { sid }, payload: { sofifaPlayerId: 201 } })
    expect(dup.statusCode).toBe(409)

    const list = await app.inject({ method: 'GET', url: `/api/careers/${careerId}/prospects`, cookies: { sid } })
    expect(list.json().prospects).toHaveLength(1)
    expect(list.json().prospects[0].player.short_name).toBe('C. Craque')
  })

  it('status contratado copia o jogador real para o elenco (sem duplicar)', async () => {
    const { app, sid, careerId } = await setup()
    const add = await app.inject({ method: 'POST', url: `/api/careers/${careerId}/prospects`, cookies: { sid }, payload: { sofifaPlayerId: 201 } })
    const prospectId = add.json().id

    await app.inject({ method: 'PATCH', url: `/api/prospects/${prospectId}`, cookies: { sid }, payload: { status: 'contratado' } })
    const players = await app.inject({ method: 'GET', url: `/api/careers/${careerId}/players`, cookies: { sid } })
    const hired = players.json().players.filter((p: any) => p.sofifa_player_id === 201)
    expect(hired).toHaveLength(1)
    expect(hired[0].overall_original).toBe(88) // dados reais da database

    // repatch não duplica
    await app.inject({ method: 'PATCH', url: `/api/prospects/${prospectId}`, cookies: { sid }, payload: { status: 'contratado' } })
    const again = await app.inject({ method: 'GET', url: `/api/careers/${careerId}/players`, cookies: { sid } })
    expect(again.json().players.filter((p: any) => p.sofifa_player_id === 201)).toHaveLength(1)
  })

  it('ISOLAMENTO: B não edita prospecto de A', async () => {
    const { app, sid, careerId } = await setup()
    const b = makeUser('b3@example.com')
    const add = await app.inject({ method: 'POST', url: `/api/careers/${careerId}/prospects`, cookies: { sid }, payload: { sofifaPlayerId: 201 } })
    const id = add.json().id
    expect((await app.inject({ method: 'PATCH', url: `/api/prospects/${id}`, cookies: { sid: b.sid }, payload: { priority: 1 } })).statusCode).toBe(404)
  })
})

describe('import-local (/api/me/import-local)', () => {
  it('importa blob do modelo antigo remapeando ids', async () => {
    const app = await buildApp()
    const { sid } = makeUser('m@example.com')
    const blob = {
      version: 1,
      careers: [{ id: 7, name: 'Antiga', fifa_version: V, team_type: 'existing', sofifa_team_id: 10, current_season: '2015/16' }],
      careerPlayers: [
        { id: 30, career_id: 7, origin: 'sofifa', sofifa_player_id: 101, name: 'A. Atacante', positions: 'ST', status: 'elenco', in_squad: 1 },
        { id: 31, career_id: 7, origin: 'youth', name: 'Base Antigo', positions: 'GK', status: 'base', in_squad: 0 },
        { id: 32, career_id: 999, origin: 'youth', name: 'Órfão', positions: 'ST', status: 'base', in_squad: 0 },
      ],
      snapshots: [
        { id: 5, career_player_id: 31, season: '2016/17', overall: 70 },
        { id: 6, career_player_id: 12345, season: '2016/17', overall: 70 }, // órfão — ignorado
      ],
      prospects: [{ id: 2, career_id: 7, sofifa_player_id: 201, status: 'observando', priority: 1 }],
    }
    const res = await app.inject({ method: 'POST', url: '/api/me/import-local', cookies: { sid }, payload: blob })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ careers: 1, players: 2, snapshots: 1, prospects: 1 })

    const careers = await app.inject({ method: 'GET', url: '/api/careers', cookies: { sid } })
    const careerId = careers.json().careers[0].id
    const players = await app.inject({ method: 'GET', url: `/api/careers/${careerId}/players`, cookies: { sid } })
    expect(players.json().players).toHaveLength(2)
    const base = players.json().players.find((p: any) => p.name === 'Base Antigo')
    expect(base.latestSnapshot.overall).toBe(70) // snapshot remapeado para o novo id
    const prospects = await app.inject({ method: 'GET', url: `/api/careers/${careerId}/prospects`, cookies: { sid } })
    expect(prospects.json().prospects).toHaveLength(1)
  })

  it('blob inválido = 400 e nada gravado', async () => {
    const app = await buildApp()
    const { sid } = makeUser('m2@example.com')
    const res = await app.inject({ method: 'POST', url: '/api/me/import-local', cookies: { sid }, payload: { version: 2 } })
    expect(res.statusCode).toBe(400)
    expect((db.prepare(`SELECT COUNT(*) c FROM careers`).get() as any).c).toBe(0)
  })
})
