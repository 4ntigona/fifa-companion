import Fastify from 'fastify'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import rateLimit from '@fastify/rate-limit'
import fastifyStatic from '@fastify/static'
import { join, dirname } from 'node:path'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { DATA_DIR } from './db/index.js'
import { gameDataRoutes } from './routes/game-data.js'
import { captureRoutes } from './routes/captures.js'
import { settingsRoutes } from './routes/settings.js'
import { importRoutes } from './routes/import.js'
import { backupRoutes } from './routes/backups.js'

const here = dirname(fileURLToPath(import.meta.url))
const webDist = join(here, '..', '..', 'web', 'dist')

const app = Fastify({ logger: true })

await app.register(cors, { origin: true })
await app.register(multipart, { attachFieldsToBody: false })
await app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
})

// Registrar a pasta de capturas primeiro
await app.register(fastifyStatic, {
  root: join(DATA_DIR, 'captures'),
  prefix: '/captures/',
})

// Registrar o build do frontend se ele existir
if (existsSync(webDist)) {
  await app.register(fastifyStatic, {
    root: webDist,
    prefix: '/',
    decorateReply: false,
  })

  app.setNotFoundHandler((request, reply) => {
    const url = request.raw.url ?? ''
    if (url.startsWith('/api/') || url.startsWith('/captures/')) {
      reply.status(404).send({ error: 'Not Found' })
      return
    }
    reply.sendFile('index.html')
  })
}

gameDataRoutes(app)
captureRoutes(app)
settingsRoutes(app)
importRoutes(app)
backupRoutes(app)

const port = Number(process.env.PORT ?? 3344)
await app.listen({ port, host: '0.0.0.0' })
