import { describe, it, expect } from 'vitest'

// Helper extractor extracted from server/src/vision/analyze.ts
function extractJsonBlock(text: string): any {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('No JSON')
  return JSON.parse(text.slice(start, end + 1))
}

describe('OCR JSON Extraction Helper', () => {
  it('correctly slices surrounding markdown block text', () => {
    const markdownOutput = 'Here is the data:\n```json\n{"screenType": "elenco", "players": []}\n```\nHope this helps!'
    const parsed = extractJsonBlock(markdownOutput)
    expect(parsed.screenType).toBe('elenco')
    expect(parsed.players).toBeTypeOf('object')
  })

  it('throws error when no brackets are present', () => {
    expect(() => extractJsonBlock('plain text output')).toThrow()
  })
})
