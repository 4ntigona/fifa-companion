import { describe, it, expect } from 'vitest'
import { fmtEur, versionLabel } from './client'

describe('Formatting Utilities', () => {
  describe('fmtEur', () => {
    it('formats numbers correctly into currency labels', () => {
      expect(fmtEur(null)).toBe('—')
      expect(fmtEur(undefined)).toBe('—')
      expect(fmtEur(500)).toBe('€500')
      expect(fmtEur(1500)).toBe('€2K')
      expect(fmtEur(2300000)).toBe('€2.3M')
    })
  })

  describe('versionLabel', () => {
    it('applies correct FIFA vs FC prefix', () => {
      expect(versionLabel(16)).toBe('FIFA 16')
      expect(versionLabel(23)).toBe('FIFA 23')
      expect(versionLabel(24)).toBe('FC 24')
    })
  })
})
