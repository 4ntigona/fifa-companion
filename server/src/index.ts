import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import fastifyStatic from '@fastify/static'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gameDataRoutes } from './routes/game-data.js'
import { importRoutes } from './routes/import.js'
import { analyzeRoutes } from './routes/analyze.js'
import { syncRoutes, pruneExpiredSyncBlobs } from './routes/sync.js'
import { authRoutes } from './routes/auth.js'
import { careerRoutes } from './routes/careers.js'
import { careerPlayerRoutes } from './routes/career-players.js'
import { prospectRoutes } from './routes/prospects.js'
import { importLocalRoutes } from './routes/import-local.js'
import { adminUserRoutes } from './routes/admin-users.js'
import { advisorRoutes } from './routes/advisor.js'
import { authPlugin } from './auth/plugin.js'
import { seedAdminIfEmpty } from './auth/seed-admin.js'
import { pruneExpiredSessions } from './auth/sessions.js'

const here = dirname(fileURLToPath(import.meta.url))

// body grande o bastante para as fotos em base64 (câmera do celular)
// trustProxy: atrás do proxy HTTPS do CloudPanel — IP real do cliente p/ rate limit.
const app = Fastify({ logger: true, bodyLimit: 30 * 1024 * 1024, trustProxy: true })

// Headers de hardening — CSP em report-only por ora (ver Step 5 do plano 004),
// para não quebrar o bundle Vite/PWA antes de calibrar.
await app.register(helmet, {
  contentSecurityPolicy: {
    reportOnly: true,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'"],
    },
  },
})

// Rate-limit global brando; rotas sensíveis (sync de escrita, import) recebem limites mais estritos.
await app.register(rateLimit, { max: 120, timeWindow: '1 minute' })

// CORS: allowlist via env em produção; sem CORS_ORIGINS definido, reflete qualquer origem (dev).
const origins = process.env.CORS_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean)
await app.register(cors, { origin: origins && origins.length ? origins : true })

// Sessões por cookie + usuário anexado a cada request
await app.register(cookie)
authPlugin(app)
authRoutes(app)

// Dados per-user (carreiras/jogadores/prospecção) — exigem sessão
careerRoutes(app)
careerPlayerRoutes(app)
prospectRoutes(app)
importLocalRoutes(app)
adminUserRoutes(app)
advisorRoutes(app)

// Database do jogo + análise de fotos (proxy stateless): leitura exige login —
// escopo próprio para o preHandler não vazar para sync (migração) e auth.
await app.register(async (scope) => {
  scope.addHook('preHandler', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'Não autenticado.' })
  })
  gameDataRoutes(scope)
  analyzeRoutes(scope)
})
importRoutes(app) // guard próprio: loopback ou sessão de admin
syncRoutes(app)   // GET fica público como fonte de migração (deprecado; sai na v0.3.000)

// GC de blobs de restauração e sessões expiradas + seed do 1º admin — uma vez no boot.
pruneExpiredSyncBlobs()
pruneExpiredSessions()
seedAdminIfEmpty(app.log)

// Front buildado (SPA). Em produção o mesmo processo serve API + app.
const webDist = process.env.WEB_DIST
  ? resolve(process.env.WEB_DIST)
  : resolve(here, '..', '..', 'web', 'dist')

if (existsSync(join(webDist, 'index.html'))) {
  await app.register(fastifyStatic, { root: webDist, prefix: '/' })
  // fallback de SPA: qualquer rota que não seja /api/* devolve o index.html
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'Not found' })
    return reply.sendFile('index.html')
  })
  app.log.info(`Servindo o front de ${webDist}`)
} else {
  app.log.warn(`web/dist não encontrado (${webDist}); rode "npm run build" no pacote web para servir o app.`)
}

const port = Number(process.env.PORT ?? 3344)
// Loopback por padrão — exponha em rede só com HOST=0.0.0.0 explícito (ex.: acessar pelo celular em dev).
await app.listen({ port, host: process.env.HOST ?? '127.0.0.1' })
