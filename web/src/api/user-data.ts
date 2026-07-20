/**
 * Dados do usuário no SERVIDOR (contas) — gêmeos async das antigas funções do
 * store.ts (mesmos nomes e retornos), para as páginas trocarem o import sem
 * mudar a lógica. As chaves de IA (BYOK) continuam no localStorage (store.ts).
 */
import { api, type Career, type CareerPlayer, type Prospect, type SofifaPlayer } from './client'

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

export function createCareer(input: CreateCareerInput): Promise<{ id: number; squadLoaded: number }> {
  return api('/api/careers', { method: 'POST', body: JSON.stringify(input) })
}

export function listCareers(): Promise<{ careers: Career[] }> {
  return api('/api/careers')
}

export function getCareer(id: number): Promise<{ career: Career }> {
  return api(`/api/careers/${id}`)
}

export interface Objective { text: string; done: boolean }

export function updateCareer(id: number, patch: {
  currentSeason?: string; currentDateIngame?: string; name?: string; objectives?: Objective[]
}) {
  return api<{ updated: number }>(`/api/careers/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
}

/** `careers.objectives` aceita tanto o formato antigo (string[]) quanto o novo
 *  ({text, done}[]) — dados existentes não quebram ao abrir o hub. */
export function parseObjectives(raw: string | null): Objective[] {
  if (!raw) return []
  const parsed = JSON.parse(raw) as unknown[]
  return parsed.map((o) => (typeof o === 'string' ? { text: o, done: false } : (o as Objective)))
}

export function deleteCareer(id: number) {
  return api<{ deleted: number }>(`/api/careers/${id}`, { method: 'DELETE' })
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

export function createCareerPlayer(input: CreatePlayerInput): Promise<{ id: number }> {
  const { careerId, sofifaPlayer, ...rest } = input
  return api(`/api/careers/${careerId}/players`, {
    method: 'POST',
    body: JSON.stringify({ ...rest, sofifaPlayerId: sofifaPlayer?.player_id }),
  })
}

export function listCareerPlayers(careerId: number): Promise<{ players: CareerPlayer[] }> {
  return api(`/api/careers/${careerId}/players`)
}

export function getCareerPlayer(id: number): Promise<{ player: CareerPlayer; career: Career }> {
  return api(`/api/career-players/${id}`)
}

export function deleteCareerPlayer(id: number) {
  return api<{ deleted: number }>(`/api/career-players/${id}`, { method: 'DELETE' })
}

export function updateCareerPlayer(id: number, patch: { status?: string; inSquad?: boolean; jerseyNumber?: number }) {
  return api<{ updated: number }>(`/api/career-players/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
}

export function addSnapshot(playerId: number, snap: {
  season: string; dateIngame?: string; overall?: number; potential?: number
  position?: string; formNotes?: string
}): Promise<{ id: number }> {
  return api(`/api/career-players/${playerId}/snapshots`, { method: 'POST', body: JSON.stringify(snap) })
}

/* ---------------- captura ---------------- */

interface CapturedSnapshot {
  season: string; dateIngame?: string; overall?: number; potential?: number
  position?: string; formNotes?: string
}

export type CapturedPlayerRow =
  | {
      target: 'new'
      origin: 'youth' | 'regen' | 'generated'
      name: string
      positions: string
      age?: number
      overallOriginal?: number
      potentialOriginal?: number
      notes?: string
      jerseyNumber?: number
      status: string
      inSquad: boolean
      snapshot?: CapturedSnapshot
    }
  | {
      target: 'existing'
      targetPlayerId: number
      snapshot: CapturedSnapshot
    }

export function applyCapturedPlayers(careerId: number, rows: CapturedPlayerRow[]): Promise<{ created: number }> {
  return api(`/api/careers/${careerId}/capture/apply`, { method: 'POST', body: JSON.stringify({ rows }) })
}

/* ---------------- prospecção ---------------- */

export function listProspects(careerId: number): Promise<{ prospects: Prospect[] }> {
  return api(`/api/careers/${careerId}/prospects`)
}

export function addProspect(careerId: number, player: SofifaPlayer): Promise<{ id: number }> {
  return api(`/api/careers/${careerId}/prospects`, {
    method: 'POST',
    body: JSON.stringify({ sofifaPlayerId: player.player_id }),
  })
}

export function updateProspect(id: number, patch: { status?: Prospect['status']; notes?: string; priority?: number }) {
  return api<{ updated: number }>(`/api/prospects/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
}

export function removeProspect(id: number) {
  return api<{ deleted: number }>(`/api/prospects/${id}`, { method: 'DELETE' })
}

/* ---------------- migração do modelo antigo ---------------- */

export interface ImportLocalResult {
  careers: number
  players: number
  snapshots: number
  prospects: number
}

export function importLocalBlob(blob: unknown): Promise<ImportLocalResult> {
  return api('/api/me/import-local', { method: 'POST', body: JSON.stringify(blob) })
}
