import { describe, it, expect } from 'vitest'

describe('smoke', () => {
  it('tem localStorage no ambiente de teste', () => {
    localStorage.setItem('x', '1')
    expect(localStorage.getItem('x')).toBe('1')
  })
})
