import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  AI_PROVIDERS,
  DEFAULT_MODELS,
  PROVIDER_LABELS,
  aiProvider,
  getSetting,
  kaggleCreds,
  mask,
  providerKey,
  providerModel,
  setSetting,
  type AiProvider,
} from '../settings.js'
import { testProvider } from '../vision/analyze.js'
import { testKaggleCreds } from '../sofifa/kaggle-download.js'

const providerEnum = z.enum(AI_PROVIDERS)

export function settingsRoutes(app: FastifyInstance) {
  app.get('/api/settings', () => ({
    ai: {
      activeProvider: aiProvider(),
      providers: Object.fromEntries(
        AI_PROVIDERS.map((p) => [
          p,
          {
            label: PROVIDER_LABELS[p],
            configured: Boolean(providerKey(p)),
            masked: mask(getSetting(p === 'anthropic' ? 'anthropic_api_key' : `${p}_api_key`)),
            fromEnv: p === 'anthropic' && !getSetting('anthropic_api_key') && Boolean(process.env.ANTHROPIC_API_KEY),
            model: providerModel(p),
            defaultModel: DEFAULT_MODELS[p],
          },
        ]),
      ),
    },
    kaggle: {
      configured: Boolean(kaggleCreds()),
      username: getSetting('kaggle_username'),
      maskedKey: mask(getSetting('kaggle_key')),
    },
  }))

  app.put('/api/settings', (req) => {
    const body = z
      .object({
        activeProvider: providerEnum.optional(),
        provider: providerEnum.optional(), // alvo de apiKey/model abaixo
        apiKey: z.string().optional(),
        model: z.string().optional(),
        // compat com formato antigo
        anthropicApiKey: z.string().optional(),
        kaggleUsername: z.string().optional(),
        kaggleKey: z.string().optional(),
      })
      .parse(req.body ?? {})

    if (body.activeProvider) setSetting('ai_provider', body.activeProvider)
    if (body.provider) {
      const keyName = body.provider === 'anthropic' ? 'anthropic_api_key' : `${body.provider}_api_key`
      if (body.apiKey !== undefined) setSetting(keyName, body.apiKey.trim())
      if (body.model !== undefined) setSetting(`${body.provider}_model`, body.model.trim())
    }
    if (body.anthropicApiKey !== undefined) setSetting('anthropic_api_key', body.anthropicApiKey.trim())
    if (body.kaggleUsername !== undefined) setSetting('kaggle_username', body.kaggleUsername.trim())
    if (body.kaggleKey !== undefined) setSetting('kaggle_key', body.kaggleKey.trim())
    return { saved: true }
  })

  app.post('/api/settings/test-ai', async (req) => {
    const { provider, apiKey } = z
      .object({
        provider: providerEnum.optional(),
        apiKey: z.string().optional(),
      })
      .parse(req.body ?? {})
    return testProvider((provider ?? aiProvider()) as AiProvider, apiKey)
  })

  // compat
  app.post('/api/settings/test-anthropic', () => testProvider('anthropic'))

  app.post('/api/settings/test-kaggle', async () => {
    const creds = kaggleCreds()
    if (!creds) return { ok: false, error: 'Usuário e key do Kaggle não configurados.' }
    return testKaggleCreds(creds.username, creds.key)
  })
}
