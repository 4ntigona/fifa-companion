import Anthropic from '@anthropic-ai/sdk'
import { aiProvider, providerKey, providerModel, PROVIDER_LABELS, type AiProvider } from '../settings.js'

export interface ExtractedPlayer {
  name: string
  positions?: string
  age?: number
  overall?: number
  potential?: number
  value?: string
  jerseyNumber?: number
  notes?: string
}

export interface VisionResult {
  screenType: 'elenco' | 'perfil_jogador' | 'base_olheiros' | 'negociacao' | 'outro'
  fifaVersionGuess?: string
  players: ExtractedPlayer[]
  context?: string
}

const SYSTEM = `Você analisa fotos de telas do modo carreira do FIFA/EA FC (fotografadas de TV ou monitor).
Extraia SOMENTE o que está visível e legível na imagem — nunca invente, estime ou complete valores que não conseguir ler.
Se um campo não estiver legível, omita-o. Responda apenas com JSON válido, sem markdown, neste formato:
{
  "screenType": "elenco" | "perfil_jogador" | "base_olheiros" | "negociacao" | "outro",
  "fifaVersionGuess": "16",
  "context": "descrição curta do que a tela mostra",
  "players": [
    { "name": "...", "positions": "ST", "age": 17, "overall": 62, "potential": 88,
      "value": "€1.2M", "jerseyNumber": 9, "notes": "info extra visível (pé, traços, status da negociação…)" }
  ]
}
Em telas de olheiros/base o potencial costuma aparecer como faixa (ex. "78-92"); nesse caso registre a faixa em notes e deixe potential ausente, a menos que um número exato esteja visível.`

const USER_TEXT = 'Analise esta foto de tela do modo carreira e extraia os dados visíveis.'

export function visionAvailable(): boolean {
  return Boolean(providerKey(aiProvider()))
}

export function visionInfo(): { provider: AiProvider; providerLabel: string; model: string; available: boolean } {
  const provider = aiProvider()
  return {
    provider,
    providerLabel: PROVIDER_LABELS[provider],
    model: providerModel(provider),
    available: Boolean(providerKey(provider)),
  }
}

export async function analyzeCapture(imageBase64: string, mediaType: string): Promise<VisionResult> {
  const provider = aiProvider()
  const key = providerKey(provider)
  if (!key) {
    throw new Error(`Chave da ${PROVIDER_LABELS[provider]} não configurada — adicione em Configurações para usar a análise de fotos.`)
  }
  const model = providerModel(provider)

  let text: string
  switch (provider) {
    case 'anthropic':
      text = await callAnthropic(key, model, imageBase64, mediaType)
      break
    case 'gemini':
      text = await callGemini(key, model, imageBase64, mediaType)
      break
    case 'openai':
      text = await callOpenAiCompatible('https://api.openai.com/v1/chat/completions', key, model, imageBase64, mediaType)
      break
    case 'openrouter':
      text = await callOpenAiCompatible('https://openrouter.ai/api/v1/chat/completions', key, model, imageBase64, mediaType)
      break
  }

  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error(`O modelo ${model} não retornou JSON: ${text.slice(0, 200)}`)
  return JSON.parse(text.slice(start, end + 1)) as VisionResult
}

async function callAnthropic(key: string, model: string, b64: string, mediaType: string): Promise<string> {
  const client = new Anthropic({ apiKey: key })
  const msg = await client.messages.create({
    model,
    max_tokens: 2000,
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/webp', data: b64 },
          },
          { type: 'text', text: USER_TEXT },
        ],
      },
    ],
  })
  return msg.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('')
}

/** OpenAI e OpenRouter compartilham o formato chat/completions. */
async function callOpenAiCompatible(url: string, key: string, model: string, b64: string, mediaType: string): Promise<string> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:${mediaType};base64,${b64}` } },
            { type: 'text', text: USER_TEXT },
          ],
        },
      ],
    }),
  })
  const body = await res.json().catch(() => null) as any
  if (!res.ok) {
    throw new Error(body?.error?.message || `Provedor respondeu HTTP ${res.status}`)
  }
  const text = body?.choices?.[0]?.message?.content
  if (typeof text !== 'string') throw new Error('Resposta do provedor sem conteúdo de texto.')
  return text
}

async function callGemini(key: string, model: string, b64: string, mediaType: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM }] },
      contents: [
        {
          parts: [
            { inline_data: { mime_type: mediaType, data: b64 } },
            { text: USER_TEXT },
          ],
        },
      ],
    }),
  })
  const body = await res.json().catch(() => null) as any
  if (!res.ok) {
    throw new Error(body?.error?.message || `Gemini respondeu HTTP ${res.status}`)
  }
  const parts = body?.candidates?.[0]?.content?.parts
  const text = Array.isArray(parts) ? parts.map((p: any) => p.text ?? '').join('') : null
  if (!text) throw new Error('Resposta do Gemini sem conteúdo de texto.')
  return text
}

/** Valida a chave de um provedor com uma chamada barata (lista de modelos). */
export async function testProvider(provider: AiProvider): Promise<{ ok: boolean; error?: string }> {
  const key = providerKey(provider)
  if (!key) return { ok: false, error: 'Nenhuma chave configurada.' }
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
