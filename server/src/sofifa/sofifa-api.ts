/**
 * Client da API oficial do SoFIFA (https://api.sofifa.net — doc em https://sofifa.com/document).
 *
 * ⚠️ Em 07/2026 a API está atrás de whitelist do Cloudflare, liberada apenas para
 * projetos parceiros aprovados pelo SoFIFA (testado: curl, Node e navegador — 403).
 * Este client fica pronto para o caso de acesso futuro; a fonte padrão do app são
 * os dumps reais em CSV (ver kaggle-csv.ts).
 *
 * Endpoints (doc set/2025):
 *   GET /leagues | /leagues/{roster} | /league/{id}/{roster}
 *   GET /teams/{roster} | /team/{id} | /team/{id}/{roster}
 *   GET /player/{id} | /player/{id}/{roster} | /player/{id}/prime
 * Roster: "{versão}{sequência}" — ex. 160001 = database de lançamento do FIFA 16.
 * Rate limit: 60 req/min (429 + bloqueio de 1 min).
 */

const BASE = 'https://api.sofifa.net'
const MIN_INTERVAL_MS = 1100 // ~54 req/min, margem sob o limite de 60

let lastRequestAt = 0

async function throttled(url: string): Promise<unknown> {
  const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now()
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastRequestAt = Date.now()

  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 65_000))
    return throttled(url)
  }
  if (!res.ok) throw new Error(`SoFIFA API ${res.status} em ${url} — acesso requer parceria com o SoFIFA`)
  return res.json()
}

export const sofifaApi = {
  leagues: (roster?: string) => throttled(`${BASE}/leagues${roster ? `/${roster}` : ''}`),
  teamsByLeague: (leagueId: number, roster: string) => throttled(`${BASE}/league/${leagueId}/${roster}`),
  teams: (roster: string) => throttled(`${BASE}/teams/${roster}`),
  team: (teamId: number, roster: string) => throttled(`${BASE}/team/${teamId}/${roster}`),
  player: (playerId: number, roster: string) => throttled(`${BASE}/player/${playerId}/${roster}`),
  playerPrime: (playerId: number) => throttled(`${BASE}/player/${playerId}/prime`),
  launchRoster: (fifaVersion: number) => `${String(fifaVersion).padStart(2, '0')}0001`,
}
