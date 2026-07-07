import Fastify from 'fastify'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import fastifyStatic from '@fastify/static'
import { join } from 'node:path'
import { DATA_DIR } from './db/index.js'
import { gameDataRoutes } from './routes/game-data.js'
import { careerRoutes } from './routes/careers.js'
import { playerRoutes } from './routes/players.js'
import { prospectRoutes } from './routes/prospects.js'
import { captureRoutes } from './routes/captures.js'
import { settingsRoutes } from './routes/settings.js'
import { importRoutes } from './routes/import.js'

const app = Fastify({ logger: true })

await app.register(cors, { origin: true })
await app.register(multipart, { attachFieldsToBody: false })
await app.register(fastifyStatic, {
  root: join(DATA_DIR, 'captures'),
  prefix: '/captures/',
})

gameDataRoutes(app)
careerRoutes(app)
playerRoutes(app)
prospectRoutes(app)
captureRoutes(app)
settingsRoutes(app)
importRoutes(app)

const port = Number(process.env.PORT ?? 3344)
await app.listen({ port, host: '0.0.0.0' })
