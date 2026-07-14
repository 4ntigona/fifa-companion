import Fastify from 'fastify'
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

const here = dirname(fileURLToPath(import.meta.url))

// body grande o bastante para as fotos em base64 (câmera do celular)
const app = Fastify({ logger: true, bodyLimit: 30 * 1024 * 1024 })

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

// API (recurso compartilhado): database do jogo + análise de fotos stateless
gameDataRoutes(app)
importRoutes(app)
analyzeRoutes(app)
syncRoutes(app)

// GC de blobs de restauração expirados — uma vez no boot.
pruneExpiredSyncBlobs()

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
