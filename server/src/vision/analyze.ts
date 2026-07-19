import { complete, extractJson } from '../ai/providers.js'
import type { AiProvider } from '../ai/providers.js'

// Re-exporta o encanamento genérico para não quebrar quem importava daqui (routes/analyze.ts).
export { AI_PROVIDERS, testProvider } from '../ai/providers.js'
export type { AiProvider } from '../ai/providers.js'

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

/** Analisa a foto usando o provedor/chave/modelo fornecidos pelo cliente (BYOK, stateless). */
export async function analyzeCapture(
  provider: AiProvider,
  apiKey: string,
  model: string,
  imageBase64: string,
  mediaType: string,
): Promise<VisionResult> {
  const text = await complete({
    provider, apiKey, model, system: SYSTEM,
    content: [
      { type: 'image', mediaType, base64: imageBase64 },
      { type: 'text', text: USER_TEXT },
    ],
  })
  return extractJson<VisionResult>(text, model)
}
