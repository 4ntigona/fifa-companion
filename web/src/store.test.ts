import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  setAiSettings, generateRestoreKey, exportBackup,
  createCareer, getCareer, deleteCareer, listCareerPlayers,
  addProspect, updateProspect, listProspects,
  addSnapshot, getCareerPlayer, createCareerPlayer,
  importBackup, listCareers, applyCapturedPlayers, updateCareerPlayer,
  getSyncInfo,
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

/** Escreve diretamente uma carreira mínima no blob (sem passar pelo mock de fetch de createCareer). */
function seedCareer(id: number) {
  localStorage.setItem('career-companion-v1', JSON.stringify({
    version: 1,
    counters: { career: id, player: 0, snapshot: 0, prospect: 0 },
    careers: [{
      id, name: 'Carreira de teste', fifa_version: 24, team_type: 'existing', sofifa_team_id: null,
      created_team_name: null, created_team_budget_eur: null, created_team_league: null,
      replaced_team_id: null, objectives: null, squad_quality: null, current_season: '2024/25',
      current_date_ingame: null,
    }],
    careerPlayers: [], snapshots: [], prospects: [],
    ai: { activeProvider: 'anthropic', keys: {}, models: {} },
    sync: { code: null, lastSyncedAt: null, lastMutatedAt: null },
  }))
}

/** Escreve um blob com uma chave de sync já configurada (para os testes de auto-sync). */
function seedSyncedCareer(id: number, code: string) {
  localStorage.setItem('career-companion-v1', JSON.stringify({
    version: 1,
    counters: { career: id, player: 0, snapshot: 0, prospect: 0 },
    careers: [{
      id, name: 'Carreira sincronizada', fifa_version: 24, team_type: 'existing', sofifa_team_id: null,
      created_team_name: null, created_team_budget_eur: null, created_team_league: null,
      replaced_team_id: null, objectives: null, squad_quality: null, current_season: '2024/25',
      current_date_ingame: null,
    }],
    careerPlayers: [], snapshots: [], prospects: [],
    ai: { activeProvider: 'anthropic', keys: {}, models: {} },
    sync: { code, lastSyncedAt: new Date(0).toISOString(), lastMutatedAt: null },
  }))
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
    seedCareer(1)
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

describe('ciclo de vida do status do jogador', () => {
  it('updateCareerPlayer altera status e in_squad', () => {
    seedCareer(1)
    const { id: playerId } = createCareerPlayer({ careerId: 1, origin: 'generated', name: 'Jogador', positions: 'ST', status: 'elenco', inSquad: true })

    updateCareerPlayer(playerId, { status: 'vendido', inSquad: false })

    const { player } = getCareerPlayer(playerId)
    expect(player.status).toBe('vendido')
    expect(player.in_squad).toBe(0)
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

describe('robustez: quota, atomicidade e reconciliação de counters', () => {
  it('save() lança um erro de domínio claro quando o localStorage estoura a quota', () => {
    // happy-dom não repassa spies de Storage.prototype para o localStorage global depois que ele
    // já foi usado por outro teste — substitui o global inteiro para garantir a interceptação.
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => { throw new DOMException('quota estourada', 'QuotaExceededError') },
      removeItem: () => {},
      clear: () => {},
    })
    try {
      expect(() => createCareerPlayer({ careerId: 1, origin: 'generated', name: 'X', positions: 'ST' }))
        .toThrow('Armazenamento local cheio')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('applyCapturedPlayers grava jogador+snapshot num único mutate (tudo ou nada)', () => {
    const { created } = applyCapturedPlayers(1, [
      { target: 'new', origin: 'youth', name: 'Jovem A', positions: 'CB', status: 'base', inSquad: false, snapshot: { season: '2024/25', overall: 65, potential: 78 } },
      { target: 'new', origin: 'generated', name: 'Gerado B', positions: 'ST', status: 'elenco', inSquad: true },
    ])

    expect(created).toBe(2)
    const { players } = listCareerPlayers(1)
    expect(players).toHaveLength(2)
    const withSnapshot = players.find((p) => p.name === 'Jovem A')!
    expect(withSnapshot.latestSnapshot?.overall).toBe(65)
    const withoutSnapshot = players.find((p) => p.name === 'Gerado B')!
    expect(withoutSnapshot.latestSnapshot).toBeNull()
  })

  it('applyCapturedPlayers com target existing grava snapshot no jogador alvo sem duplicar', () => {
    const { id: existingId } = createCareerPlayer({ careerId: 1, origin: 'generated', name: 'Titular', positions: 'CB' })

    const { created } = applyCapturedPlayers(1, [
      { target: 'existing', targetPlayerId: existingId, snapshot: { season: '2025/26', overall: 84, potential: 84 } },
    ])

    expect(created).toBe(1)
    const { players } = listCareerPlayers(1)
    expect(players).toHaveLength(1)
    expect(players[0].id).toBe(existingId)
    expect(players[0].latestSnapshot?.overall).toBe(84)
  })

  it('importBackup reconcilia counters — um blob com ids altos e counters zerados não colide', async () => {
    const backup = {
      version: 1,
      counters: { career: 0, player: 0, snapshot: 0, prospect: 0 },
      careers: [{ id: 1, name: 'Importada', fifa_version: 24, team_type: 'existing', sofifa_team_id: null, created_team_name: null, created_team_budget_eur: null, created_team_league: null, replaced_team_id: null, objectives: null, squad_quality: null, current_season: '2024/25', current_date_ingame: null }],
      careerPlayers: [{ id: 5, career_id: 1, origin: 'generated', sofifa_player_id: null, name: 'Existente', positions: 'GK', age: null, overall_original: null, potential_original: null, strengths: null, notes: null, jersey_number: null, status: 'base', in_squad: 1 }],
      snapshots: [],
      prospects: [],
      ai: { activeProvider: 'anthropic', keys: {}, models: {} },
    }
    const file = { text: async () => JSON.stringify(backup) } as unknown as File
    await importBackup(file)

    const { id: newId } = createCareerPlayer({ careerId: 1, origin: 'generated', name: 'Novo', positions: 'ST' })
    expect(newId).toBeGreaterThan(5)
  })
})

describe('auto-sync: push automático com debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  function mockPut(): { calls: number } {
    const state = { calls: 0 }
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') state.calls++
      return { ok: true, json: async () => ({ updated: 1 }) } as Response
    }) as typeof fetch
    return state
  }

  it('agenda um push após mutação quando há chave de sync', async () => {
    seedSyncedCareer(1, 'AAAA-BBBB-CCCC')
    const state = mockPut()

    createCareerPlayer({ careerId: 1, origin: 'generated', name: 'X', positions: 'ST' })
    await vi.advanceTimersByTimeAsync(10_000)

    expect(state.calls).toBe(1)
  })

  it('não agenda push sem chave de sync', async () => {
    seedCareer(1)
    const state = mockPut()

    createCareerPlayer({ careerId: 1, origin: 'generated', name: 'X', positions: 'ST' })
    await vi.advanceTimersByTimeAsync(10_000)

    expect(state.calls).toBe(0)
  })

  it('debounce colapsa mutações em sequência num único PUT', async () => {
    seedSyncedCareer(1, 'AAAA-BBBB-CCCC')
    const state = mockPut()

    createCareerPlayer({ careerId: 1, origin: 'generated', name: 'X', positions: 'ST' })
    createCareerPlayer({ careerId: 1, origin: 'generated', name: 'Y', positions: 'ST' })
    createCareerPlayer({ careerId: 1, origin: 'generated', name: 'Z', positions: 'ST' })
    await vi.advanceTimersByTimeAsync(10_000)

    expect(state.calls).toBe(1)
  })

  it('o push automático não reagenda a si mesmo (anti-loop)', async () => {
    seedSyncedCareer(1, 'AAAA-BBBB-CCCC')
    const state = mockPut()

    createCareerPlayer({ careerId: 1, origin: 'generated', name: 'X', positions: 'ST' })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(state.calls).toBe(1)

    await vi.advanceTimersByTimeAsync(30_000)
    expect(state.calls).toBe(1)
  })

  it('lastMutatedAt avança em mutate() e o dirty se resolve após o push', async () => {
    seedSyncedCareer(1, 'AAAA-BBBB-CCCC')
    mockPut()

    createCareerPlayer({ careerId: 1, origin: 'generated', name: 'X', positions: 'ST' })
    const afterMutate = getSyncInfo()
    expect(afterMutate.lastMutatedAt).not.toBeNull()
    expect(afterMutate.lastSyncedAt! < afterMutate.lastMutatedAt!).toBe(true)

    await vi.advanceTimersByTimeAsync(10_000)
    const afterPush = getSyncInfo()
    expect(afterPush.lastSyncedAt! >= afterPush.lastMutatedAt!).toBe(true)
  })
})
