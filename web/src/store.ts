/**
 * Armazenamento local remanescente (localStorage).
 *
 * Desde as contas (v0.3.000), carreiras/jogadores/prospecção vivem no SERVIDOR
 * (ver api/user-data.ts). Aqui ficam apenas:
 *  - as chaves BYOK de IA (invariante: nunca vão para o servidor);
 *  - o leitor do blob legado, usado uma única vez pela migração pós-login.
 */

const STORAGE_KEY = 'career-companion-v1'
const MIGRATED_KEY = 'career-companion-migrated'

// Mantido em sincronia manualmente com AI_PROVIDERS em server/src/vision/analyze.ts —
// ao adicionar/remover um provedor, mude LÁ também (o zod do /api/analyze valida contra ele).
export type AiProvider = 'anthropic' | 'openai' | 'gemini' | 'openrouter'

export const PROVIDER_LABELS: Record<AiProvider, string> = {
  anthropic: 'Anthropic (Claude)',
  openai: 'OpenAI (ChatGPT)',
  gemini: 'Google Gemini',
  openrouter: 'OpenRouter',
}

export const DEFAULT_MODELS: Record<AiProvider, string> = {
  anthropic: 'claude-sonnet-5',
  openai: 'gpt-5.1',
  gemini: 'gemini-2.5-flash',
  openrouter: 'google/gemini-2.5-flash',
}

export interface AiSettings {
  activeProvider: AiProvider
  keys: Partial<Record<AiProvider, string>>
  models: Partial<Record<AiProvider, string>>
}

interface LocalBlob {
  version: 1
  careers?: unknown[]
  careerPlayers?: unknown[]
  snapshots?: unknown[]
  prospects?: unknown[]
  ai?: Partial<AiSettings>
}

const emptyAi = (): AiSettings => ({ activeProvider: 'anthropic', keys: {}, models: {} })

function loadBlob(): LocalBlob | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const blob = JSON.parse(raw) as LocalBlob
    if (blob.version !== 1) return null
    return blob
  } catch {
    return null
  }
}

function saveAi(ai: AiSettings) {
  const blob = loadBlob() ?? { version: 1 as const }
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...blob, ai }))
}

/* ---------------- BYOK (chaves locais) ---------------- */

export function getAiSettings(): AiSettings {
  const ai = loadBlob()?.ai
  return { ...emptyAi(), ...ai, keys: { ...ai?.keys }, models: { ...ai?.models } }
}

export function setAiSettings(patch: Partial<AiSettings> & { key?: { provider: AiProvider; value: string }; model?: { provider: AiProvider; value: string } }) {
  const ai = getAiSettings()
  if (patch.activeProvider) ai.activeProvider = patch.activeProvider
  if (patch.key) {
    if (patch.key.value) ai.keys[patch.key.provider] = patch.key.value
    else delete ai.keys[patch.key.provider]
  }
  if (patch.model) {
    if (patch.model.value) ai.models[patch.model.provider] = patch.model.value
    else delete ai.models[patch.model.provider]
  }
  saveAi(ai)
  return ai
}

export function aiModel(p: AiProvider): string {
  return getAiSettings().models[p] || DEFAULT_MODELS[p]
}

/* ---------------- blob legado (migração one-shot pós-login) ---------------- */

/** Dados do modelo antigo ainda não migrados para a conta, ou null. Sem segredos (chaves ficam de fora). */
export function readLegacyBlob(): { careers: unknown[]; careerPlayers: unknown[]; snapshots: unknown[]; prospects: unknown[]; version: 1 } | null {
  if (localStorage.getItem(MIGRATED_KEY)) return null
  const blob = loadBlob()
  if (!blob || !Array.isArray(blob.careers) || blob.careers.length === 0) return null
  return {
    version: 1,
    careers: blob.careers,
    careerPlayers: Array.isArray(blob.careerPlayers) ? blob.careerPlayers : [],
    snapshots: Array.isArray(blob.snapshots) ? blob.snapshots : [],
    prospects: Array.isArray(blob.prospects) ? blob.prospects : [],
  }
}

/** Marca o blob como migrado (ele fica no navegador como fallback, mas o banner some). */
export function markLegacyMigrated() {
  localStorage.setItem(MIGRATED_KEY, new Date().toISOString())
}
