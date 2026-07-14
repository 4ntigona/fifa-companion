import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setAiSettings, generateRestoreKey, exportBackup } from './store'

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('segurança: chaves BYOK nunca saem do dispositivo', () => {
  it('não inclui ai.keys no payload enviado ao servidor (chave de restauração)', async () => {
    setAiSettings({ key: { provider: 'openai', value: 'sk-secreta-NAO-VAZA' } })

    let sentBody = ''
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      sentBody = String(init?.body ?? '')
      return {
        ok: true,
        json: async () => ({ code: 'AAAA-BBBB-CCCC' }),
      } as Response
    }) as typeof fetch

    await generateRestoreKey()

    expect(sentBody).not.toContain('sk-secreta-NAO-VAZA')
    const parsed = JSON.parse(sentBody)
    const data = JSON.parse(parsed.data)
    expect(data.ai.keys).toEqual({})
    // provider/model continuam presentes (só a chave em si é removida)
    expect(data.ai).toHaveProperty('activeProvider')
  })

  it('não inclui ai.keys no arquivo de backup exportado', () => {
    setAiSettings({ key: { provider: 'anthropic', value: 'sk-ant-outra-secreta' } })

    let exportedText = ''
    const realBlob = globalThis.Blob
    // @ts-expect-error — mock simples só para capturar o conteúdo do Blob
    globalThis.Blob = class {
      constructor(parts: string[]) { exportedText = parts.join('') }
    }
    const clickSpy = vi.fn()
    vi.spyOn(document, 'createElement').mockReturnValue({ click: clickSpy, href: '' } as unknown as HTMLAnchorElement)
    URL.createObjectURL = vi.fn(() => 'blob:fake')
    URL.revokeObjectURL = vi.fn()

    exportBackup()

    expect(exportedText).not.toContain('sk-ant-outra-secreta')
    const parsed = JSON.parse(exportedText)
    expect(parsed.ai.keys).toEqual({})

    globalThis.Blob = realBlob
  })
})
