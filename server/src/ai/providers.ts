import Anthropic from '@anthropic-ai/sdk'

/**
 * Encanamento BYOK genérico, compartilhado por captura (imagem) e conselheiro (texto).
 * Recebe um system prompt + conteúdo (texto e/ou imagem) e devolve o texto do modelo.
 * Stateless: a chave nunca é persistida — o chamador (rota) a recebe do cliente e a
 * repassa aqui. NUNCA logar a chave.
 */

// Mantido em sincronia manualmente com o tipo AiProvider em web/src/store.ts.
export const AI_PROVIDERS = ['anthropic', 'openai', 'gemini', 'openrouter'] as const
export type AiProvider = (typeof AI_PROVIDERS)[number]

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; mediaType: string; base64: string }

export interface CompletionRequest {
  provider: AiProvider
  apiKey: string
  model: string
  system: string
  content: ContentPart[]
  maxTokens?: number
}

/** Uma chamada de completude ao provedor escolhido. Retorna o texto bruto do modelo. */
export async function complete(req: CompletionRequest): Promise<string> {
  const maxTokens = req.maxTokens ?? 2000
  switch (req.provider) {
    case 'anthropic':
      return callAnthropic(req, maxTokens)
    case 'gemini':
      return callGemini(req)
    case 'openai':
      return callOpenAiCompatible('https://api.openai.com/v1/chat/completions', req, maxTokens)
    case 'openrouter':
      return callOpenAiCompatible('https://openrouter.ai/api/v1/chat/completions', req, maxTokens)
  }
}

async function callAnthropic(req: CompletionRequest, maxTokens: number): Promise<string> {
  const client = new Anthropic({ apiKey: req.apiKey })
  const msg = await client.messages.create({
    model: req.model,
    max_tokens: maxTokens,
    system: req.system,
    messages: [{
      role: 'user',
      content: req.content.map((p) =>
        p.type === 'text'
          ? { type: 'text' as const, text: p.text }
          : {
              type: 'image' as const,
              source: { type: 'base64' as const, media_type: p.mediaType as 'image/jpeg' | 'image/png' | 'image/webp', data: p.base64 },
            },
      ),
    }],
  })
  return msg.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('')
}

/** OpenAI e OpenRouter compartilham o formato chat/completions. */
async function callOpenAiCompatible(url: string, req: CompletionRequest, maxTokens: number): Promise<string> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${req.apiKey}` },
    body: JSON.stringify({
      model: req.model,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: req.system },
        {
          role: 'user',
          content: req.content.map((p) =>
            p.type === 'text'
              ? { type: 'text', text: p.text }
              : { type: 'image_url', image_url: { url: `data:${p.mediaType};base64,${p.base64}` } },
          ),
        },
      ],
    }),
  })
  const body = await res.json().catch(() => null) as any
  if (!res.ok) throw new Error(body?.error?.message || `Provedor respondeu HTTP ${res.status}`)
  const text = body?.choices?.[0]?.message?.content
  if (typeof text !== 'string') throw new Error('Resposta do provedor sem conteúdo de texto.')
  return text
}

async function callGemini(req: CompletionRequest): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(req.model)}:generateContent`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': req.apiKey },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: req.system }] },
      contents: [{
        parts: req.content.map((p) =>
          p.type === 'text' ? { text: p.text } : { inline_data: { mime_type: p.mediaType, data: p.base64 } },
        ),
      }],
    }),
  })
  const body = await res.json().catch(() => null) as any
  if (!res.ok) throw new Error(body?.error?.message || `Gemini respondeu HTTP ${res.status}`)
  const parts = body?.candidates?.[0]?.content?.parts
  const text = Array.isArray(parts) ? parts.map((p: any) => p.text ?? '').join('') : null
  if (!text) throw new Error('Resposta do Gemini sem conteúdo de texto.')
  return text
}

/** Extrai o primeiro objeto JSON do texto do modelo (que às vezes vem cercado de prosa/markdown). */
export function extractJson<T>(text: string, model: string): T {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error(`O modelo ${model} não retornou JSON: ${text.slice(0, 200)}`)
  return JSON.parse(text.slice(start, end + 1)) as T
}

/** Valida a chave de um provedor com uma chamada barata (lista de modelos). */
export async function testProvider(provider: AiProvider, key: string): Promise<{ ok: boolean; error?: string }> {
  if (!key) return { ok: false, error: 'Nenhuma chave informada.' }
  try {
    let res: Response
    switch (provider) {
      case 'anthropic': {
        const client = new Anthropic({ apiKey: key })
        await client.models.list()
        return { ok: true }
      }
      case 'openai':
        res = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${key}` } })
        break
      case 'openrouter':
        res = await fetch('https://openrouter.ai/api/v1/models', { headers: { Authorization: `Bearer ${key}` } })
        break
      case 'gemini':
        res = await fetch('https://generativelanguage.googleapis.com/v1beta/models', { headers: { 'x-goog-api-key': key } })
        break
    }
    if (res.ok) return { ok: true }
    const body = await res.json().catch(() => null) as any
    return {
      ok: false,
      error: res.status === 401 || res.status === 403
        ? 'Chave inválida ou sem permissão.'
        : body?.error?.message || `Provedor respondeu HTTP ${res.status}.`,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg.includes('401') ? 'Chave inválida (401).' : msg }
  }
}
