import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../db/index.js'
import { AI_PROVIDERS, analyzeCapture, testProvider } from '../vision/analyze.js'

const providerEnum = z.enum(AI_PROVIDERS)

/**
 * Análise de fotos — stateless e BYOK: o cliente envia a imagem (base64) junto com
 * o provedor, a chave e o modelo (que vivem no localStorage do usuário). Nada é
 * gravado no servidor. O servidor apenas faz proxy para o provedor de IA (resolve
 * CORS e mantém a chave fora do bundle público).
 */
export function analyzeRoutes(app: FastifyInstance) {
  app.post('/api/analyze', async (req, reply) => {
    const body = z.object({
      provider: providerEnum,
      apiKey: z.string().min(1),
      model: z.string().min(1),
      mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
      imageBase64: z.string().min(1),
    }).safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'Requisição inválida.' })

    const { provider, apiKey, model, mediaType, imageBase64 } = body.data
    try {
      const extracted = await analyzeCapture(provider, apiKey, model, imageBase64, mediaType)
      return { extracted }
    } catch (e) {
      return reply.code(502).send({ error: String(e instanceof Error ? e.message : e) })
    }
  })

  app.post('/api/test-ai', async (req, reply) => {
    const body = z.object({ provider: providerEnum, apiKey: z.string() }).safeParse(req.body)
    if (!body.success) return reply.code(400).send({ ok: false, error: 'Requisição inválida.' })
    return testProvider(body.data.provider, body.data.apiKey)
  })

  // Status do servidor (recurso compartilhado): quais versões da database estão importadas.
  app.get('/api/status', () => {
    const imported = db.prepare(
      `SELECT fifa_version AS v, COUNT(*) AS players FROM sofifa_players GROUP BY fifa_version ORDER BY v`,
    ).all()
    return { importedVersions: imported }
  })
}
