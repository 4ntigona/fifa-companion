import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  setAiSettings, generateRestoreKey, exportBackup,
  createCareer, getCareer, deleteCareer, listCareerPlayers,
  addProspect, updateProspect, listProspects,
  addSnapshot, getCareerPlayer, createCareerPlayer,
  importBackup, listCareers,
} from './store'
import type { SofifaPlayer } from './api/client'

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

function fakeSquadPlayer(id: number, name: string): SofifaPlayer {
  return {
    fifa_version: 24, player_id: id, short_name: name, long_name: name,
    positions: 'ST', overall: 80, potential: 85, value_eur: 1_000_000, wage_eur: 10_000,
    age: 22, club_name: 'Time Fake', league_name: 'Liga Fake', nationality_name: 'Brasil',
    club_jersey_number: 9, club_loaned_from: null, preferred_foot: 'Direito', weak_foot: 3,
    skill_moves: 3, pace: 80, shooting: 80, passing: 70, dribbling: 75, defending: 30, physic: 70,
    attributes_json: '{}',
  }
}

function mockFetchOnce(body: unknown) {
  globalThis.fetch = (async () => ({
    ok: true,
    json: async () => body,
  })) as unknown as typeof fetch
}

describe('segurança: chaves BYOK nunca saem do dispositivo', () => {
  it('não inclui ai.keys no payload enviado ao servidor (chave de restauração)', async () => {
    setAiSettings({ key: { provider: 'openai', value: 'sk-secreta-NAO-VAZA' } })

    let sentBody = ''
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      sentBody = String(init?.body ?? '')
      return {
        ok: true,
        json: async () => ({ code: 'AAAA-BBBB-CCCC' }),
      } as Response
    }) as typeof fetch

    await generateRestoreKey()

    expect(sentBody).not.toContain('sk-secreta-NAO-VAZA')
    const parsed = JSON.parse(sentBody)
    const data = JSON.parse(parsed.data)
    expect(data.ai.keys).toEqual({})
    // provider/model continuam presentes (só a chave em si é removida)
    expect(data.ai).toHaveProperty('activeProvider')
  })

  it('não inclui ai.keys no arquivo de backup exportado', () => {
    setAiSettings({ key: { provider: 'anthropic', value: 'sk-ant-outra-secreta' } })

    let exportedText = ''
    const realBlob = globalThis.Blob
    // @ts-expect-error — mock simples só para capturar o conteúdo do Blob
    globalThis.Blob = class {
      constructor(parts: string[]) { exportedText = parts.join('') }
    }
    const clickSpy = vi.fn()
    vi.spyOn(document, 'createElement').mockReturnValue({ click: clickSpy, href: '' } as unknown as HTMLAnchorElement)
    URL.createObjectURL = vi.fn(() => 'blob:fake')
    URL.revokeObjectURL = vi.fn()

    exportBackup()

    expect(exportedText).not.toContain('sk-ant-outra-secreta')
    const parsed = JSON.parse(exportedText)
    expect(parsed.ai.keys).toEqual({})

    globalThis.Blob = realBlob
  })
})

describe('carreira: criação, leitura e cascata de exclusão', () => {
  it('createCareer (time existente) copia o elenco para careerPlayers com origin sofifa', async () => {
    mockFetchOnce({
      team: { fifa_version: 24, team_id: 1, team_name: 'Time Fake', league_name: 'Liga Fake', nationality_name: null, overall: 80, attack: 80, midfield: 80, defence: 80, transfer_budget_eur: null, club_worth_eur: null },
      players: [fakeSquadPlayer(1, 'Jogador A'), fakeSquadPlayer(2, 'Jogador B')],
    })

    const { id, squadLoaded } = await createCareer({
      name: 'Minha Carreira', fifaVersion: 24, teamType: 'existing', sofifaTeamId: 1, currentSeason: '2024/25',
    })

    expect(squadLoaded).toBe(2)
    const { players } = listCareerPlayers(id)
    expect(players).toHaveLength(2)
    expect(players.every((p) => p.origin === 'sofifa' && p.career_id === id)).toBe(true)
  })

  it('getCareer de id inexistente lança "Carreira não encontrada"', () => {
    expect(() => getCareer(999)).toThrow('Carreira não encontrada')
  })

  it('deleteCareer remove a carreira e faz cascata em careerPlayers/snapshots/prospects', async () => {
    mockFetchOnce({
      team: { fifa_version: 24, team_id: 1, team_name: 'Time Fake', league_name: null, nationality_name: null, overall: 80, attack: 80, midfield: 80, defence: 80, transfer_budget_eur: null, club_worth_eur: null },
      players: [fakeSquadPlayer(1, 'Jogador A')],
    })
    const { id } = await createCareer({
      name: 'Carreira a Excluir', fifaVersion: 24, teamType: 'existing', sofifaTeamId: 1, currentSeason: '2024/25',
    })
    const { players } = listCareerPlayers(id)
    const playerId = players[0].id
    addSnapshot(playerId, { season: '2024/25', overall: 81 })
    addProspect(id, fakeSquadPlayer(2, 'Prospecto'))

    deleteCareer(id)

    expect(() => getCareer(id)).toThrow('Carreira não encontrada')
    expect(listCareerPlayers(id).players).toHaveLength(0)
    expect(listProspects(id).prospects).toHaveLength(0)
    expect(() => getCareerPlayer(playerId)).toThrow('Jogador não encontrado')
  })
})

describe('prospecção: shortlist duplicada e contratação idempotente', () => {
  it('addProspect do mesmo jogador duas vezes lança "já está na shortlist"', () => {
    createCareerPlayer({ careerId: 1, origin: 'generated', name: 'Base', positions: 'ST' })
    addProspect(1, fakeSquadPlayer(10, 'Alvo'))
    expect(() => addProspect(1, fakeSquadPlayer(10, 'Alvo'))).toThrow('já está na shortlist')
  })

  it('updateProspect(status: contratado) cria um careerPlayer e não duplica em chamadas repetidas', () => {
    const { id: prospectId } = addProspect(1, fakeSquadPlayer(11, 'Contratado'))

    updateProspect(prospectId, { status: 'contratado' })
    expect(listCareerPlayers(1).players.filter((p) => p.sofifa_player_id === 11)).toHaveLength(1)

    updateProspect(prospectId, { status: 'contratado' })
    expect(listCareerPlayers(1).players.filter((p) => p.sofifa_player_id === 11)).toHaveLength(1)
  })
})

describe('snapshots', () => {
  it('addSnapshot anexa ao jogador certo e getCareerPlayer retorna os snapshots dele', () => {
    const { id: playerId } = createCareerPlayer({ careerId: 1, origin: 'generated', name: 'Jogador', positions: 'GK' })
    const { id: otherPlayerId } = createCareerPlayer({ careerId: 1, origin: 'generated', name: 'Outro', positions: 'GK' })
    addSnapshot(playerId, { season: '2024/25', overall: 70 })
    addSnapshot(playerId, { season: '2025/26', overall: 72 })
    addSnapshot(otherPlayerId, { season: '2024/25', overall: 60 })

    const { player } = getCareerPlayer(playerId)
    expect(player.snapshots).toHaveLength(2)
    expect(player.snapshots?.every((s) => s.career_player_id === playerId)).toBe(true)
  })
})

describe('export/import de backup', () => {
  it('importBackup válido substitui o estado e retorna as contagens', async () => {
    createCareerPlayer({ careerId: 1, origin: 'generated', name: 'Antigo', positions: 'ST' })

    const backup = {
      version: 1,
      counters: { career: 1, player: 1, snapshot: 0, prospect: 0 },
      careers: [{ id: 1, name: 'Importada', fifa_version: 24, team_type: 'existing', sofifa_team_id: null, created_team_name: null, created_team_budget_eur: null, created_team_league: null, replaced_team_id: null, objectives: null, squad_quality: null, current_season: '2024/25', current_date_ingame: null }],
      careerPlayers: [{ id: 1, career_id: 1, origin: 'generated', sofifa_player_id: null, name: 'Novo', positions: 'GK', age: null, overall_original: null, potential_original: null, strengths: null, notes: null, jersey_number: null, status: 'base', in_squad: 1 }],
      snapshots: [],
      prospects: [],
      ai: { activeProvider: 'anthropic', keys: {}, models: {} },
    }
    const file = { text: async () => JSON.stringify(backup) } as unknown as File

    const result = await importBackup(file)

    expect(result).toEqual({ careers: 1, players: 1 })
    expect(listCareers().careers.map((c) => c.name)).toEqual(['Importada'])
  })

  it('importBackup com formato inválido lança e não apaga o estado atual', async () => {
    createCareerPlayer({ careerId: 1, origin: 'generated', name: 'Preservado', positions: 'ST' })
    const before = listCareerPlayers(1).players

    const file = { text: async () => JSON.stringify({ version: 2 }) } as unknown as File
    await expect(importBackup(file)).rejects.toThrow('Arquivo de backup inválido')

    expect(listCareerPlayers(1).players).toEqual(before)
  })

  // Comportamento atual conhecido (não é o ideal): load() engole qualquer erro de parse/versão
  // e devolve um estado vazio silenciosamente, em vez de sinalizar corrupção ao chamador.
  it('load() de um blob corrompido no localStorage devolve estado vazio sem lançar', () => {
    localStorage.setItem('career-companion-v1', '{ isto não é json válido')
    expect(() => listCareers()).not.toThrow()
    expect(listCareers().careers).toEqual([])
  })
})
