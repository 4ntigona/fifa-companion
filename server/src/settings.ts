import { db } from './db/index.js'

/** Tokens e preferências ficam no SQLite local (server/data/companion.db), nunca saem da máquina. */

export function getSetting(key: string): string | null {
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setSetting(key: string, value: string | null) {
  if (value == null || value === '') db.prepare(`DELETE FROM settings WHERE key = ?`).run(key)
  else db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, value)
}

export function anthropicKey(): string | null {
  return getSetting('anthropic_api_key') || process.env.ANTHROPIC_API_KEY || null
}

/* ---- BYOK: provedores de IA para a análise de fotos ---- */

export const AI_PROVIDERS = ['anthropic', 'openai', 'gemini', 'openrouter'] as const
export type AiProvider = (typeof AI_PROVIDERS)[number]

export const PROVIDER_LABELS: Record<AiProvider, string> = {
  anthropic: 'Anthropic (Claude)',
  openai: 'OpenAI (ChatGPT)',
  gemini: 'Google Gemini',
  openrouter: 'OpenRouter',
}

/** Modelos padrão (editáveis pelo usuário) — precisam suportar visão. */
export const DEFAULT_MODELS: Record<AiProvider, string> = {
  anthropic: process.env.VISION_MODEL || 'claude-sonnet-5',
  openai: 'gpt-5.1',
  gemini: 'gemini-2.5-flash',
  openrouter: 'google/gemini-2.5-flash',
}

export function aiProvider(): AiProvider {
  const p = getSetting('ai_provider')
  return AI_PROVIDERS.includes(p as AiProvider) ? (p as AiProvider) : 'anthropic'
}

export function providerKey(p: AiProvider): string | null {
  if (p === 'anthropic') return anthropicKey()
  return getSetting(`${p}_api_key`)
}

export function providerModel(p: AiProvider): string {
  return getSetting(`${p}_model`) || DEFAULT_MODELS[p]
}

export function kaggleCreds(): { username: string; key: string } | null {
  const username = getSetting('kaggle_username')
  const key = getSetting('kaggle_key')
  return username && key ? { username, key } : null
}

/** Mostra só o suficiente para o usuário reconhecer o token salvo. */
export function mask(value: string | null): string | null {
  if (!value) return null
  return value.length <= 8 ? '••••' : `${value.slice(0, 4)}…${value.slice(-4)}`
}
