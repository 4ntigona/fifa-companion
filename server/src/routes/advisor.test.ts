import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import { authPlugin } from '../auth/plugin.js'
import { hashPassword } from '../auth/passwords.js'
import { createSession } from '../auth/sessions.js'
import { db } from '../db/index.js'

// Mocka só o `complete` (a chamada de rede ao provedor); mantém AI_PROVIDERS/extractJson reais.
const completeMock = vi.fn()
vi.mock('../ai/providers.js', async (importActual) => ({
  ...(await importActual<typeof import('../ai/providers.js')>()),
  complete: (...args: unknown[]) => completeMock(...args),
}))

const { advisorRoutes } = await import('./advisor.js')
const { careerRoutes } = await import('./careers.js')
const { careerPlayerRoutes } = await import('./career-players.js')
const { buildCareerContext } = await import('../ai/advisor.js')
import type { CareerRow } from './careers.js'

const V = 9997

async function buildApp() {
  const app = Fastify()
  await app.register(cookie)
  authPlugin(app)
  careerRoutes(app)
  careerPlayerRoutes(app)
  advisorRoutes(app)
  return app
}
function makeUser(email: string) {
  const { salt, hash } = hashPassword('senha-de-teste-1')
  const id = Number(db.prepare(`INSERT INTO users (email, password_hash, salt) VALUES (?, ?, ?)`).run(email, hash, salt).lastInsertRowid)
  return { id, sid: createSession(id) }
}
async function makeCareer(app: Awaited<ReturnType<typeof buildApp>>, sid: string): Promise<number> {
  const r = await app.inject({
    method: 'POST', url: '/api/careers', cookies: { sid },
    payload: { name: 'Carreira Teste', fifaVersion: V, teamType: 'existing', sofifaTeamId: 10, currentSeason: '2015/16' },
  })
  return r.json().id
}

beforeAll(() => {
  db.prepare(`DELETE FROM sofifa_players WHERE fifa_version = ?`).run(V)
  db.prepare(`DELETE FROM sofifa_teams WHERE fifa_version = ?`).run(V)
  db.prepare(`INSERT INTO sofifa_teams (fifa_version, team_id, team_name, league_name, overall) VALUES (?, 10, 'Test FC', 'Liga', 80)`).run(V)
  const ins = db.prepare(
    `INSERT INTO sofifa_players (fifa_version, player_id, short_name, long_name, positions, overall, potential, age, club_team_id, attributes_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 10, '{}')`,
  )
  ins.run(V, 101, 'A. Atacante', 'Alfa', 'ST', 82, 90, 19)
  ins.run(V, 102, 'B. Beque', 'Beto', 'CB', 78, 84, 24)
})
beforeEach(() => {
  db.prepare(`DELETE FROM careers`).run()
  db.prepare(`DELETE FROM sessions`).run()
  db.prepare(`DELETE FROM users`).run()
  completeMock.mockReset()
})

const FAKE = JSON.stringify({
  resumo: 'Elenco jovem com potencial.',
  orientacoes: [{ titulo: 'Desenvolver A. Atacante', detalhe: 'Dê minutos.', prioridade: 'alta', jogadores: ['A. Atacante'] }],
})

describe('conselheiro (/api/careers/:id/advisor)', () => {
  it('exige sessão (401 sem cookie)', async () => {
    const app = await buildApp()
    expect((await app.inject({ method: 'GET', url: '/api/careers/1/advisor' })).statusCode).toBe(401)
  })

  it('isola por usuário: 404 na carreira de outro', async () => {
    const app = await buildApp()
    const owner = makeUser('a@x.com')
    const careerId = await makeCareer(app, owner.sid)
    const intruder = makeUser('b@x.com')
    const res = await app.inject({
      method: 'POST', url: `/api/careers/${careerId}/advisor`, cookies: { sid: intruder.sid },
      payload: { provider: 'anthropic', apiKey: 'k', model: 'm' },
    })
    expect(res.statusCode).toBe(404)
    expect(completeMock).not.toHaveBeenCalled()
  })

  it('gera parecer, persiste e aparece no histórico', async () => {
    completeMock.mockResolvedValue(FAKE)
    const app = await buildApp()
    const { sid } = makeUser('a@x.com')
    const careerId = await makeCareer(app, sid)

    const res = await app.inject({
      method: 'POST', url: `/api/careers/${careerId}/advisor`, cookies: { sid },
      payload: { provider: 'anthropic', apiKey: 'segredo', model: 'claude-x' },
    })
    expect(res.statusCode).toBe(200)
    const { report } = res.json()
    expect(report.kind).toBe('parecer')
    expect(report.report.orientacoes[0].titulo).toContain('Atacante')
    expect(completeMock).toHaveBeenCalledOnce()

    const hist = await app.inject({ method: 'GET', url: `/api/careers/${careerId}/advisor`, cookies: { sid } })
    expect(hist.json().reports).toHaveLength(1)
    // a chave nunca é persistida
    const raw = db.prepare(`SELECT response_json, question FROM advisor_reports`).get() as { response_json: string; question: string | null }
    expect(raw.response_json).not.toContain('segredo')
    expect(raw.question).toBeNull()
  })

  it('marca kind=consulta quando há pergunta', async () => {
    completeMock.mockResolvedValue(FAKE)
    const app = await buildApp()
    const { sid } = makeUser('a@x.com')
    const careerId = await makeCareer(app, sid)
    const res = await app.inject({
      method: 'POST', url: `/api/careers/${careerId}/advisor`, cookies: { sid },
      payload: { provider: 'anthropic', apiKey: 'k', model: 'm', question: 'Preciso de um zagueiro?' },
    })
    expect(res.json().report.kind).toBe('consulta')
    expect(res.json().report.question).toBe('Preciso de um zagueiro?')
  })

  it('502 quando o provedor falha (sem gravar nada)', async () => {
    completeMock.mockRejectedValue(new Error('Chave inválida (401).'))
    const app = await buildApp()
    const { sid } = makeUser('a@x.com')
    const careerId = await makeCareer(app, sid)
    const res = await app.inject({
      method: 'POST', url: `/api/careers/${careerId}/advisor`, cookies: { sid },
      payload: { provider: 'anthropic', apiKey: 'k', model: 'm' },
    })
    expect(res.statusCode).toBe(502)
    expect((db.prepare(`SELECT COUNT(*) AS c FROM advisor_reports`).get() as { c: number }).c).toBe(0)
  })
})

describe('buildCareerContext', () => {
  it('inclui elenco, objetivos e shortlist a partir do banco', async () => {
    const app = await buildApp()
    const { sid } = makeUser('a@x.com')
    const careerId = await makeCareer(app, sid)
    // objetivo + prospecto direto no banco
    db.prepare(`UPDATE careers SET objectives = ? WHERE id = ?`).run(JSON.stringify([{ text: 'Vencer a liga', done: false }]), careerId)
    db.prepare(`INSERT INTO prospects (career_id, sofifa_player_id, status, priority) VALUES (?, 102, 'observando', 1)`).run(careerId)

    const career = db.prepare(`SELECT * FROM careers WHERE id = ?`).get(careerId) as CareerRow
    const ctx = buildCareerContext(career)
    expect(ctx).toContain('A. Atacante')
    expect(ctx).toContain('Objetivos da diretoria')
    expect(ctx).toContain('Vencer a liga')
    expect(ctx).toContain('Shortlist')
    expect(ctx).toContain('Test FC')
  })
})
