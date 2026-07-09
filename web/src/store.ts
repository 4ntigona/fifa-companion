/**
 * Armazenamento local do usuário (localStorage).
 *
 * Todos os dados da carreira — carreiras, jogadores, snapshots, prospecção e as
 * chaves BYOK — vivem no navegador do usuário, num único blob JSON versionado.
 * O servidor guarda apenas a database original do jogo (somente leitura) e
 * analisa fotos de forma stateless. Export/import = arquivo JSON de backup.
 */
import { api, type Career, type CareerPlayer, type Prospect, type Snapshot, type SofifaPlayer, type SofifaTeam } from './api/client'

const STORAGE_KEY = 'career-companion-v1'

export type AiProvider = 'anthropic' | 'openai' | 'gemini' | 'openrouter'

export const PROVIDER_LABELS: Record<AiProvider, string> = {
  anthropic: 'Anthropic (Claude)',
  openai: 'OpenAI (ChatGPT)',
  gemini: 'Google Gemini',
  openrouter: 'OpenRouter',
}

export const DEFAULT_MODELS: Record<AiProvider, string> = {
  anthropic: 'claude-sonnet-5',
  openai: 'gpt-4o',
  gemini: 'gemini-2.5-flash',
  openrouter: 'google/gemini-2.5-flash',
}

export interface AiSettings {
  activeProvider: AiProvider
  keys: Partial<Record<AiProvider, string>>
  models: Partial<Record<AiProvider, string>>
}

interface LocalDb {
  version: 1
  counters: { career: number; player: number; snapshot: number; prospect: number }
  careers: Career[]
  careerPlayers: CareerPlayer[]
  snapshots: Snapshot[]
  prospects: Prospect[]
  ai: AiSettings
}

function emptyDb(): LocalDb {
  return {
    version: 1,
    counters: { career: 0, player: 0, snapshot: 0, prospect: 0 },
    careers: [],
    careerPlayers: [],
    snapshots: [],
    prospects: [],
    ai: { activeProvider: 'anthropic', keys: {}, models: {} },
  }
}

function load(): LocalDb {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyDb()
    const db = JSON.parse(raw) as LocalDb
    if (db.version !== 1) throw new Error('versão desconhecida')
    return { ...emptyDb(), ...db, ai: { ...emptyDb().ai, ...db.ai } }
  } catch {
    return emptyDb()
  }
}

function save(db: LocalDb) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
}

function mutate<T>(fn: (db: LocalDb) => T): T {
  const db = load()
  const result = fn(db)
  save(db)
  return result
}

const nowIso = () => new Date().toISOString()

/* ---------------- carreiras ---------------- */

export interface CreateCareerInput {
  name: string
  fifaVersion: number
  teamType: 'existing' | 'created'
  sofifaTeamId?: number
  createdTeamName?: string
  createdTeamBudgetEur?: number
  createdTeamLeague?: string
  replacedTeamId?: number
  objectives?: string[]
  squadQuality?: string
  currentSeason: string
}

export async function createCareer(input: CreateCareerInput): Promise<{ id: number; squadLoaded: number }> {
  if (input.teamType === 'created' && input.fifaVersion < 22) {
    throw new Error('Criar clube só existe do FIFA 22 em diante.')
  }
  if (input.teamType === 'existing' && !input.sofifaTeamId) {
    throw new Error('Selecione o time original do jogo.')
  }

  // dados reais do time/elenco vêm da database do jogo no servidor
  let team: SofifaTeam | undefined
  let squad: SofifaPlayer[] = []
  if (input.teamType === 'existing' && input.sofifaTeamId) {
    const r = await api<{ team: SofifaTeam; players: SofifaPlayer[] }>(
      `/api/team/${input.fifaVersion}/${input.sofifaTeamId}`,
    )
    team = r.team
    squad = r.players
  }
  let replacedTeam: SofifaTeam | undefined
  if (input.teamType === 'created' && input.replacedTeamId) {
    const r = await api<{ team: SofifaTeam }>(`/api/team/${input.fifaVersion}/${input.replacedTeamId}`)
    replacedTeam = r.team
  }

  return mutate((db) => {
    const id = ++db.counters.career
    db.careers.unshift({
      id,
      name: input.name,
      fifa_version: input.fifaVersion,
      team_type: input.teamType,
      sofifa_team_id: input.sofifaTeamId ?? null,
      created_team_name: input.createdTeamName ?? null,
      created_team_budget_eur: input.createdTeamBudgetEur ?? null,
      created_team_league: input.createdTeamLeague ?? null,
      replaced_team_id: input.replacedTeamId ?? null,
      objectives: input.objectives ? JSON.stringify(input.objectives) : null,
      squad_quality: input.squadQuality ?? null,
      current_season: input.currentSeason,
      current_date_ingame: null,
      team,
      replacedTeam,
    })
    // elenco original completo — cópia dos dados reais, nunca editados
    for (const p of squad) {
      db.careerPlayers.push({
        id: ++db.counters.player,
        career_id: id,
        origin: 'sofifa',
        sofifa_player_id: p.player_id,
        name: p.short_name,
        positions: p.positions,
        age: p.age,
        overall_original: p.overall,
        potential_original: p.potential,
        strengths: null,
        notes: null,
        jersey_number: p.club_jersey_number,
        status: p.club_loaned_from ? 'emprestado' : 'elenco',
        in_squad: 1,
        sofifa: p,
      })
    }
    return { id, squadLoaded: squad.length }
  })
}

export function listCareers(): { careers: Career[] } {
  const db = load()
  return {
    careers: db.careers.map((c) => ({
      ...c,
      playerCount: db.careerPlayers.filter((p) => p.career_id === c.id).length,
    })),
  }
}

export function getCareer(id: number): { career: Career } {
  const c = load().careers.find((x) => x.id === id)
  if (!c) throw new Error('Carreira não encontrada')
  return { career: c }
}

export function updateCareer(id: number, patch: { currentSeason?: string; currentDateIngame?: string; name?: string }) {
  return mutate((db) => {
    const c = db.careers.find((x) => x.id === id)
    if (!c) return { updated: 0 }
    if (patch.currentSeason !== undefined) c.current_season = patch.currentSeason
    if (patch.currentDateIngame !== undefined) c.current_date_ingame = patch.currentDateIngame
    if (patch.name !== undefined) c.name = patch.name
    return { updated: 1 }
  })
}

export function deleteCareer(id: number) {
  return mutate((db) => {
    const playerIds = new Set(db.careerPlayers.filter((p) => p.career_id === id).map((p) => p.id))
    db.careers = db.careers.filter((c) => c.id !== id)
    db.careerPlayers = db.careerPlayers.filter((p) => p.career_id !== id)
    db.snapshots = db.snapshots.filter((s) => !playerIds.has(s.career_player_id))
    db.prospects = db.prospects.filter((p) => p.career_id !== id)
    return { deleted: 1 }
  })
}

/* ---------------- jogadores da carreira ---------------- */

export interface CreatePlayerInput {
  careerId: number
  origin: 'sofifa' | 'generated' | 'youth' | 'regen'
  sofifaPlayer?: SofifaPlayer
  name: string
  positions: string
  age?: number
  overallOriginal?: number
  potentialOriginal?: number
  strengths?: string
  notes?: string
  jerseyNumber?: number
  status?: string
  inSquad?: boolean
}

export function createCareerPlayer(input: CreatePlayerInput): { id: number } {
  return mutate((db) => {
    const id = ++db.counters.player
    db.careerPlayers.push({
      id,
      career_id: input.careerId,
      origin: input.origin,
      sofifa_player_id: input.sofifaPlayer?.player_id ?? null,
      name: input.name,
      positions: input.positions,
      age: input.age ?? null,
      overall_original: input.overallOriginal ?? null,
      potential_original: input.potentialOriginal ?? null,
      strengths: input.strengths ?? null,
      notes: input.notes ?? null,
      jersey_number: input.jerseyNumber ?? null,
      status: input.status ?? (input.origin === 'youth' || input.origin === 'regen' ? 'base' : 'elenco'),
      in_squad: input.inSquad === false ? 0 : 1,
      sofifa: input.sofifaPlayer,
    })
    return { id }
  })
}

export function listCareerPlayers(careerId: number): { players: CareerPlayer[] } {
  const db = load()
  return {
    players: db.careerPlayers
      .filter((p) => p.career_id === careerId)
      .map((p) => ({
        ...p,
        latestSnapshot: db.snapshots.filter((s) => s.career_player_id === p.id).at(-1) ?? null,
      })),
  }
}

export function getCareerPlayer(id: number): { player: CareerPlayer; career: Career } {
  const db = load()
  const p = db.careerPlayers.find((x) => x.id === id)
  if (!p) throw new Error('Jogador não encontrado')
  const career = db.careers.find((c) => c.id === p.career_id)!
  return { player: { ...p, snapshots: db.snapshots.filter((s) => s.career_player_id === id) }, career }
}

export function deleteCareerPlayer(id: number) {
  return mutate((db) => {
    db.careerPlayers = db.careerPlayers.filter((p) => p.id !== id)
    db.snapshots = db.snapshots.filter((s) => s.career_player_id !== id)
    return { deleted: 1 }
  })
}

export function addSnapshot(playerId: number, snap: {
  season: string; dateIngame?: string; overall?: number; potential?: number
  position?: string; formNotes?: string
}): { id: number } {
  return mutate((db) => {
    const id = ++db.counters.snapshot
    db.snapshots.push({
      id,
      career_player_id: playerId,
      season: snap.season,
      date_ingame: snap.dateIngame ?? null,
      overall: snap.overall ?? null,
      potential: snap.potential ?? null,
      position: snap.position ?? null,
      attributes_json: null,
      form_notes: snap.formNotes ?? null,
    })
    return { id }
  })
}

/* ---------------- prospecção ---------------- */

export function listProspects(careerId: number): { prospects: Prospect[] } {
  return { prospects: load().prospects.filter((p) => p.career_id === careerId) }
}

export function addProspect(careerId: number, player: SofifaPlayer): { id: number } {
  return mutate((db) => {
    if (db.prospects.some((p) => p.career_id === careerId && p.sofifa_player_id === player.player_id)) {
      throw new Error('Jogador já está na shortlist.')
    }
    const id = ++db.counters.prospect
    db.prospects.push({
      id,
      career_id: careerId,
      sofifa_player_id: player.player_id,
      status: 'observando',
      priority: 2,
      notes: null,
      player,
    })
    return { id }
  })
}

export function updateProspect(id: number, patch: { status?: Prospect['status']; notes?: string; priority?: number }) {
  return mutate((db) => {
    const pr = db.prospects.find((p) => p.id === id)
    if (!pr) return { updated: 0 }
    if (patch.status) pr.status = patch.status
    if (patch.notes !== undefined) pr.notes = patch.notes
    if (patch.priority) pr.priority = patch.priority
    // contratado → entra no elenco com os dados reais copiados da database
    if (patch.status === 'contratado' && pr.player) {
      const exists = db.careerPlayers.some(
        (p) => p.career_id === pr.career_id && p.sofifa_player_id === pr.sofifa_player_id,
      )
      if (!exists) {
        db.careerPlayers.push({
          id: ++db.counters.player,
          career_id: pr.career_id,
          origin: 'sofifa',
          sofifa_player_id: pr.player.player_id,
          name: pr.player.short_name,
          positions: pr.player.positions,
          age: pr.player.age,
          overall_original: pr.player.overall,
          potential_original: pr.player.potential,
          strengths: null,
          notes: null,
          jersey_number: null,
          status: 'elenco',
          in_squad: 1,
          sofifa: pr.player,
        })
      }
    }
    return { updated: 1 }
  })
}

export function removeProspect(id: number) {
  return mutate((db) => {
    db.prospects = db.prospects.filter((p) => p.id !== id)
    return { deleted: 1 }
  })
}

/* ---------------- BYOK (chaves locais) ---------------- */

export function getAiSettings(): AiSettings {
  return load().ai
}

export function setAiSettings(patch: Partial<AiSettings> & { key?: { provider: AiProvider; value: string }; model?: { provider: AiProvider; value: string } }) {
  return mutate((db) => {
    if (patch.activeProvider) db.ai.activeProvider = patch.activeProvider
    if (patch.key) {
      if (patch.key.value) db.ai.keys[patch.key.provider] = patch.key.value
      else delete db.ai.keys[patch.key.provider]
    }
    if (patch.model) {
      if (patch.model.value) db.ai.models[patch.model.provider] = patch.model.value
      else delete db.ai.models[patch.model.provider]
    }
    return db.ai
  })
}

export function aiModel(p: AiProvider): string {
  const ai = load().ai
  return ai.models[p] || DEFAULT_MODELS[p]
}

/* ---------------- export / import ---------------- */

export function exportBackup() {
  const db = load()
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `career-companion-backup-${nowIso().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

export async function importBackup(file: File): Promise<{ careers: number; players: number }> {
  const text = await file.text()
  const data = JSON.parse(text) as LocalDb
  if (data?.version !== 1 || !Array.isArray(data.careers) || !Array.isArray(data.careerPlayers)) {
    throw new Error('Arquivo de backup inválido (formato não reconhecido).')
  }
  save({ ...emptyDb(), ...data, ai: { ...emptyDb().ai, ...data.ai } })
  return { careers: data.careers.length, players: data.careerPlayers.length }
}

export function storageUsage(): { bytes: number } {
  return { bytes: (localStorage.getItem(STORAGE_KEY) ?? '').length }
}

export async function shareBackupOnServer(): Promise<string> {
  const db = load()
  const res = await api<{ code: string }>('/api/backups/share', {
    method: 'POST',
    body: JSON.stringify(db),
  })
  return res.code
}

export async function recoverBackupFromServer(code: string): Promise<{ careers: number; players: number }> {
  const cleanCode = code.trim().toUpperCase()
  if (!cleanCode) throw new Error('Por favor, informe um código de backup válido.')
  const data = await api<LocalDb>(`/api/backups/recover/${cleanCode}`)
  if (data?.version !== 1 || !Array.isArray(data.careers) || !Array.isArray(data.careerPlayers)) {
    throw new Error('O backup recuperado do servidor possui formato inválido.')
  }
  save({ ...emptyDb(), ...data, ai: { ...emptyDb().ai, ...data.ai } })
  return { careers: data.careers.length, players: data.careerPlayers.length }
}
