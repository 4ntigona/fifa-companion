import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../db/index.js'
import { mustBeUser } from '../auth/plugin.js'
import { getOwnedCareer } from './careers.js'
import { AI_PROVIDERS, complete, extractJson } from '../ai/providers.js'
import { ADVISOR_SYSTEM, buildAdvisorPrompt, buildCareerContext, type AdvisorReport } from '../ai/advisor.js'

interface ReportRow {
  id: number
  career_id: number
  kind: 'parecer' | 'consulta'
  question: string | null
  response_json: string
  provider: string
  model: string
  created_at: string
}

const publicReport = (r: ReportRow) => ({
  id: r.id,
  kind: r.kind,
  question: r.question,
  report: JSON.parse(r.response_json) as AdvisorReport,
  provider: r.provider,
  model: r.model,
  createdAt: r.created_at,
})

const askSchema = z.object({
  provider: z.enum(AI_PROVIDERS),
  apiKey: z.string().min(1),
  model: z.string().min(1),
  question: z.string().max(500).optional(),
})

/**
 * Conselheiro de IA — BYOK stateless como /api/analyze: a chave vem do cliente e NUNCA é
 * persistida. O servidor monta o contexto da carreira (do banco, por user_id), chama o
 * provedor e persiste a RESPOSTA (dado do usuário) no histórico. Gatilho sempre explícito.
 */
export function advisorRoutes(app: FastifyInstance) {
  // histórico (parecer mais recente primeiro)
  app.get<{ Params: { id: string } }>('/api/careers/:id/advisor', { preHandler: [mustBeUser] }, (req, reply) => {
    const career = getOwnedCareer(req.user!.id, Number(req.params.id))
    if (!career) return reply.code(404).send({ error: 'Carreira não encontrada' })
    const rows = db.prepare(`SELECT * FROM advisor_reports WHERE career_id = ? ORDER BY id DESC LIMIT 20`).all(career.id) as ReportRow[]
    return { reports: rows.map(publicReport) }
  })

  // nova análise/consulta (custa uma chamada BYOK — gatilho explícito do usuário)
  app.post<{ Params: { id: string } }>('/api/careers/:id/advisor', { preHandler: [mustBeUser] }, async (req, reply) => {
    const career = getOwnedCareer(req.user!.id, Number(req.params.id))
    if (!career) return reply.code(404).send({ error: 'Carreira não encontrada' })
    const parsed = askSchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'Requisição inválida.' })
    const { provider, apiKey, model, question } = parsed.data

    const context = buildCareerContext(career)
    let report: AdvisorReport
    try {
      const text = await complete({
        provider, apiKey, model,
        system: ADVISOR_SYSTEM,
        content: [{ type: 'text', text: buildAdvisorPrompt(context, question) }],
        maxTokens: 1500,
      })
      report = extractJson<AdvisorReport>(text, model)
    } catch (e) {
      return reply.code(502).send({ error: String(e instanceof Error ? e.message : e) })
    }

    const kind = question && question.trim() ? 'consulta' : 'parecer'
    const res = db.prepare(
      `INSERT INTO advisor_reports (career_id, kind, question, response_json, provider, model)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(career.id, kind, question?.trim() ?? null, JSON.stringify(report), provider, model)
    const row = db.prepare(`SELECT * FROM advisor_reports WHERE id = ?`).get(Number(res.lastInsertRowid)) as ReportRow
    return { report: publicReport(row) }
  })
}
