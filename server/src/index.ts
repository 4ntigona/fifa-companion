import Fastify from 'fastify'
import cors from '@fastify/cors'
import fastifyStatic from '@fastify/static'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gameDataRoutes } from './routes/game-data.js'
import { importRoutes } from './routes/import.js'
import { analyzeRoutes } from './routes/analyze.js'
import { syncRoutes } from './routes/sync.js'

const here = dirname(fileURLToPath(import.meta.url))

// body grande o bastante para as fotos em base64 (câmera do celular)
const app = Fastify({ logger: true, bodyLimit: 30 * 1024 * 1024 })

await app.register(cors, { origin: true })

// API (recurso compartilhado): database do jogo + análise de fotos stateless
gameDataRoutes(app)
importRoutes(app)
analyzeRoutes(app)
syncRoutes(app)

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
await app.listen({ port, host: process.env.HOST ?? '0.0.0.0' })
