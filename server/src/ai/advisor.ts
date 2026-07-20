import { db } from '../db/index.js'
import type { CareerRow } from '../routes/careers.js'

/**
 * Monta o CONTEXTO do conselheiro a partir do banco (por carreira) e o prompt.
 * Só entram dados reais do save/da database do jogo — a IA opina, os fatos são do banco.
 */

export interface AdvisorReport {
  resumo: string
  orientacoes: {
    titulo: string
    detalhe: string
    prioridade: 'alta' | 'media' | 'baixa'
    jogadores?: string[]
  }[]
}

interface PlayerRow {
  name: string; positions: string; age: number | null; status: string
  overall_original: number | null; potential_original: number | null
  sofifa_player_id: number | null
}
interface SnapRow { overall: number | null; potential: number | null }
interface ProspectRow {
  sofifa_player_id: number; status: string; priority: number; notes: string | null
}

/** Texto estruturado com o estado atual da carreira — vira o "conteúdo" enviado ao modelo. */
export function buildCareerContext(career: CareerRow): string {
  const lines: string[] = []
  const teamName = career.team_type === 'created' ? career.created_team_name : sofifaTeamName(career)
  lines.push(`# Carreira: ${career.name}`)
  lines.push(`Clube: ${teamName ?? '—'} · Versão: FIFA ${career.fifa_version} · Temporada: ${career.current_season}`)
  if (career.created_team_budget_eur != null) lines.push(`Verba: €${career.created_team_budget_eur.toLocaleString('pt-BR')}`)
  if (career.squad_quality) lines.push(`Qualidade do elenco: ${career.squad_quality}`)

  const objectives = parseObjectives(career.objectives)
  if (objectives.length) {
    lines.push('', '## Objetivos da diretoria')
    for (const o of objectives) lines.push(`- [${o.done ? 'cumprido' : 'pendente'}] ${o.text}`)
  }

  const players = db.prepare(`SELECT * FROM career_players WHERE career_id = ? ORDER BY id`).all(career.id) as PlayerRow[]
  const lastSnap = db.prepare(`SELECT overall, potential FROM player_snapshots WHERE career_player_id = ? ORDER BY id DESC LIMIT 1`)
  const sofifa = db.prepare(`SELECT overall, potential FROM sofifa_players WHERE fifa_version = ? AND player_id = ?`)

  const squad: string[] = []
  const youth: string[] = []
  for (const p of players as (PlayerRow & { id: number })[]) {
    const base = p.sofifa_player_id != null
      ? (sofifa.get(career.fifa_version, p.sofifa_player_id) as SnapRow | undefined)
      : undefined
    const baseOvr = base?.overall ?? p.overall_original
    const basePot = base?.potential ?? p.potential_original
    const snap = lastSnap.get(p.id) as SnapRow | undefined
    const curOvr = snap?.overall ?? baseOvr
    const growth = baseOvr != null && curOvr != null && curOvr !== baseOvr ? ` (era ${baseOvr})` : ''
    const line = `- ${p.name} · ${p.positions} · ${p.age ?? '?'} anos · OVR ${curOvr ?? '?'}${growth} / POT ${basePot ?? '?'} · ${p.status}`
    if (p.status === 'base' || p.status === 'regen' || p.status === 'youth') youth.push(line)
    else squad.push(line)
  }
  if (squad.length) { lines.push('', `## Elenco (${squad.length})`); lines.push(...squad) }
  if (youth.length) { lines.push('', `## Base e regens (${youth.length})`); lines.push(...youth) }

  const prospects = db.prepare(`SELECT * FROM prospects WHERE career_id = ? ORDER BY priority`).all(career.id) as ProspectRow[]
  if (prospects.length) {
    lines.push('', '## Shortlist (alvos observados)')
    const prio = ['', 'alta', 'média', 'baixa']
    for (const pr of prospects) {
      const s = sofifa.get(career.fifa_version, pr.sofifa_player_id) as (SnapRow & { short_name?: string; positions?: string }) | undefined
      const info = s ? `OVR ${s.overall ?? '?'} / POT ${s.potential ?? '?'}` : `#${pr.sofifa_player_id}`
      lines.push(`- ${info} · prioridade ${prio[pr.priority] ?? '?'} · ${pr.status}${pr.notes ? ` · ${pr.notes}` : ''}`)
    }
  }
  return lines.join('\n')
}

export const ADVISOR_SYSTEM = `Você é o conselheiro de desenvolvimento de elenco de um jogador do modo carreira do FIFA/EA FC.
Recebe o estado real da carreira (elenco, base, objetivos da diretoria, shortlist) e dá orientações práticas e priorizadas focadas em DESENVOLVER O TIME para cumprir os objetivos.
Regras:
- Baseie-se SOMENTE nos dados fornecidos. Cite jogadores pelo nome. Nunca invente atributos ou jogadores.
- Seja específico e acionável (quem promover/desenvolver, quem vender/emprestar, que lacuna cobrir, qual alvo da shortlist resolve o quê).
- Responda em português, apenas com JSON válido, sem markdown, neste formato:
{
  "resumo": "1-2 frases com o panorama",
  "orientacoes": [
    { "titulo": "curto", "detalhe": "explicação acionável", "prioridade": "alta" | "media" | "baixa", "jogadores": ["Nome"] }
  ]
}`

export function buildAdvisorPrompt(context: string, question?: string): string {
  if (question && question.trim()) {
    return `${context}\n\n## Pergunta do técnico\n${question.trim()}\n\nResponda à pergunta usando os dados acima, no formato JSON pedido.`
  }
  return `${context}\n\nFaça uma análise completa da carreira e devolva as orientações priorizadas no formato JSON pedido.`
}

/* helpers */
interface Objective { text: string; done: boolean }
function parseObjectives(raw: string | null): Objective[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown[]
    return parsed.map((o) => (typeof o === 'string' ? { text: o, done: false } : (o as Objective)))
  } catch { return [] }
}
function sofifaTeamName(career: CareerRow): string | null {
  if (career.sofifa_team_id == null) return null
  const t = db.prepare(`SELECT team_name FROM sofifa_teams WHERE fifa_version = ? AND team_id = ?`)
    .get(career.fifa_version, career.sofifa_team_id) as { team_name: string } | undefined
  return t?.team_name ?? null
}
