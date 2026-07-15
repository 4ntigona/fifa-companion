import { describe, it, expect } from 'vitest'
import { sanitizeStat } from './hooks'

describe('sanitizeStat', () => {
  it('mantém valores dentro do range normal (0-99)', () => {
    expect(sanitizeStat('90')).toBe('90')
    expect(sanitizeStat('0')).toBe('0')
    expect(sanitizeStat('99')).toBe('99')
  })

  it('remove caracteres não numéricos', () => {
    expect(sanitizeStat('9a0')).toBe('90')
  })

  it('teto em 99 — reproduz e corrige o bug de concatenação num input controlado (ex.: "90"+"91"="9091")', () => {
    expect(sanitizeStat('9091')).toBe('99')
    expect(sanitizeStat('999')).toBe('99')
  })

  it('string vazia permanece vazia', () => {
    expect(sanitizeStat('')).toBe('')
  })
})
