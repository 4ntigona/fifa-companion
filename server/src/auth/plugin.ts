import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { SESSION_COOKIE, lookupSession, type SessionUser } from './sessions.js'

declare module 'fastify' {
  interface FastifyRequest {
    user: SessionUser | null
  }
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/**
 * Anexa o usuário da sessão (cookie `sid`) a cada request e aplica o check de
 * Origin em mutações — cinto-e-suspensório além do SameSite=Lax do cookie.
 * Requer @fastify/cookie registrado antes.
 */
export function authPlugin(app: FastifyInstance) {
  app.decorateRequest('user', null)

  // Allowlist de origens para mutações: CORS_ORIGINS quando definido (produção);
  // sem a env (dev), qualquer Origin passa. Requests sem Origin (curl, CLI,
  // app.inject) passam sempre — o check mira navegadores cross-site.
  const allowed = process.env.CORS_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean)
  app.addHook('onRequest', async (req, reply) => {
    if (!MUTATING.has(req.method) || !req.url.startsWith('/api/')) return
    const origin = req.headers.origin
    if (!origin || !allowed?.length) return
    if (!allowed.includes(origin)) {
      return reply.code(403).send({ error: 'Origem não permitida.' })
    }
  })

  app.addHook('preHandler', async (req) => {
    const token = req.cookies?.[SESSION_COOKIE]
    if (token) req.user = lookupSession(token)
  })
}

/** preHandler de rota: exige sessão válida. */
export async function mustBeUser(req: FastifyRequest, reply: FastifyReply) {
  if (!req.user) return reply.code(401).send({ error: 'Não autenticado.' })
}

/** preHandler de rota: exige sessão de admin. */
export async function mustBeAdmin(req: FastifyRequest, reply: FastifyReply) {
  if (!req.user) return reply.code(401).send({ error: 'Não autenticado.' })
  if (req.user.role !== 'admin') return reply.code(403).send({ error: 'Acesso restrito a administradores.' })
}
