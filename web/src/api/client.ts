export async function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  // Content-Type só quando há corpo: Fastify rejeita (400) um Content-Type
  // application/json em requisição sem corpo (ex.: DELETE sem body).
  const hasBody = init?.body != null && !(init.body instanceof FormData)
  let res: Response
  try {
    res = await fetch(path, {
      headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
      ...init,
    })
  } catch {
    throw new Error('Não foi possível falar com o servidor. Verifique sua conexão — ou se o servidor do app está no ar.')
  }
  if (!res.ok) {
    let msg: string | null = null
    try { msg = (await res.json()).error ?? null } catch { /* corpo não-JSON */ }
    if (!msg) {
      msg = res.status >= 500
        ? `O servidor está indisponível no momento (HTTP ${res.status}). Tente de novo em instantes.`
        : `Erro ${res.status}`
    }
    throw new Error(msg)
  }
  return res.json() as Promise<T>
}

/** Análise de foto (stateless) no servidor, com BYOK vindo do localStorage. */
export async function analyzePhoto(input: {
  provider: string; apiKey: string; model: string; mediaType: string; imageBase64: string
}): Promise<VisionResult> {
  const r = await api<{ extracted: VisionResult }>('/api/analyze', {
    method: 'POST', body: JSON.stringify(input),
  })
  return r.extracted
}

export const fmtEur = (v?: number | null) =>
  v == null ? '—' : v >= 1_000_000 ? `€${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `€${Math.round(v / 1000)}K` : `€${v}`

export const versionLabel = (v: number) => (v <= 23 ? `FIFA ${v}` : `FC ${v}`)

export interface VersionInfo {
  fifaVersion: number
  label: string
  imported: boolean
  playerCount: number
  createClub: boolean
}

/** Subconjunto de colunas devolvido pela busca (`GET /api/players/:version`) — sem
 *  attributes_json nem os atributos individuais, que só vêm na reidratação completa. */
export interface SofifaPlayerListItem {
  fifa_version: number
  player_id: number
  short_name: string
  long_name: string
  positions: string
  overall: number
  potential: number
  value_eur: number | null
  wage_eur: number | null
  age: number
  club_name: string | null
  league_name: string | null
  nationality_name: string | null
}

export interface SofifaPlayer extends SofifaPlayerListItem {
  club_jersey_number: number | null
  club_loaned_from: string | null
  preferred_foot: string | null
  weak_foot: number | null
  skill_moves: number | null
  pace: number | null
  shooting: number | null
  passing: number | null
  dribbling: number | null
  defending: number | null
  physic: number | null
  attributes_json: string
}

export interface SofifaTeam {
  fifa_version: number
  team_id: number
  team_name: string
  league_name: string | null
  nationality_name: string | null
  overall: number | null
  attack: number | null
  midfield: number | null
  defence: number | null
  transfer_budget_eur: number | null
  club_worth_eur: number | null
}

export interface Career {
  id: number
  name: string
  fifa_version: number
  team_type: 'existing' | 'created'
  sofifa_team_id: number | null
  created_team_name: string | null
  created_team_budget_eur: number | null
  created_team_league: string | null
  replaced_team_id: number | null
  objectives: string | null
  squad_quality: string | null
  current_season: string
  current_date_ingame: string | null
  team?: SofifaTeam
  replacedTeam?: SofifaTeam
  playerCount?: number
}

export interface CareerPlayer {
  id: number
  career_id: number
  origin: 'sofifa' | 'generated' | 'youth' | 'regen'
  sofifa_player_id: number | null
  name: string
  positions: string
  age: number | null
  overall_original: number | null
  potential_original: number | null
  strengths: string | null
  notes: string | null
  jersey_number: number | null
  status: string
  in_squad: number
  sofifa?: SofifaPlayer
  regenOf?: SofifaPlayer
  latestSnapshot?: Snapshot | null
  snapshots?: Snapshot[]
}

export interface Snapshot {
  id: number
  career_player_id: number
  season: string
  date_ingame: string | null
  overall: number | null
  potential: number | null
  position: string | null
  attributes_json: string | null
  form_notes: string | null
}

export interface Prospect {
  id: number
  career_id: number
  sofifa_player_id: number
  status: 'observando' | 'negociando' | 'contratado' | 'descartado'
  priority: number
  notes: string | null
  player?: SofifaPlayer
}

export interface ExtractedPlayer {
  name: string
  positions?: string
  age?: number
  overall?: number
  potential?: number
  value?: string
  jerseyNumber?: number
  notes?: string
}

export interface VisionResult {
  screenType: string
  fifaVersionGuess?: string
  context?: string
  players: ExtractedPlayer[]
}
