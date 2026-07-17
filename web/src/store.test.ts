import { describe, it, expect, beforeEach } from 'vitest'
import { getAiSettings, setAiSettings, aiModel, readLegacyBlob, markLegacyMigrated, DEFAULT_MODELS } from './store'

beforeEach(() => localStorage.clear())

describe('configurações de IA (BYOK local)', () => {
  it('guarda e lê chave/modelo por provedor', () => {
    setAiSettings({ key: { provider: 'openai', value: 'sk-teste' } })
    setAiSettings({ model: { provider: 'openai', value: 'gpt-x' } })
    setAiSettings({ activeProvider: 'openai' })
    const ai = getAiSettings()
    expect(ai.activeProvider).toBe('openai')
    expect(ai.keys.openai).toBe('sk-teste')
    expect(aiModel('openai')).toBe('gpt-x')
  })

  it('valor vazio remove a chave; modelo ausente cai no padrão', () => {
    setAiSettings({ key: { provider: 'gemini', value: 'AIza-x' } })
    setAiSettings({ key: { provider: 'gemini', value: '' } })
    expect(getAiSettings().keys.gemini).toBeUndefined()
    expect(aiModel('gemini')).toBe(DEFAULT_MODELS.gemini)
  })

  it('blob corrompido não explode (volta ao default)', () => {
    localStorage.setItem('career-companion-v1', '{corrompido')
    expect(getAiSettings().activeProvider).toBe('anthropic')
  })
})

describe('blob legado (migração)', () => {
  const legacy = {
    version: 1,
    careers: [{ id: 1, name: 'Antiga' }],
    careerPlayers: [{ id: 2 }],
    snapshots: [],
    prospects: [],
    ai: { activeProvider: 'anthropic', keys: { anthropic: 'sk-segredo' }, models: {} },
  }

  it('expõe os dados antigos SEM as chaves de IA', () => {
    localStorage.setItem('career-companion-v1', JSON.stringify(legacy))
    const blob = readLegacyBlob()
    expect(blob).not.toBeNull()
    expect(blob!.careers).toHaveLength(1)
    expect(JSON.stringify(blob)).not.toContain('sk-segredo')
  })

  it('sem carreiras antigas → null; depois de migrado → null', () => {
    expect(readLegacyBlob()).toBeNull()
    localStorage.setItem('career-companion-v1', JSON.stringify(legacy))
    expect(readLegacyBlob()).not.toBeNull()
    markLegacyMigrated()
    expect(readLegacyBlob()).toBeNull()
  })

  it('marcar como migrado não afeta as configurações de IA', () => {
    localStorage.setItem('career-companion-v1', JSON.stringify(legacy))
    markLegacyMigrated()
    expect(getAiSettings().keys.anthropic).toBe('sk-segredo')
  })
})
