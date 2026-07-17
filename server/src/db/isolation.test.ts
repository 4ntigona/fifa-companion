import { describe, it, expect } from 'vitest'
import { DATA_DIR, db } from './index.js'
import { tmpdir } from 'node:os'

describe('isolamento de teste', () => {
  it('a suíte roda numa base efêmera, não na base real de desenvolvimento', () => {
    expect(DATA_DIR.startsWith(tmpdir())).toBe(true)
    // base efêmera nasce vazia — nenhum jogador real importado (excluindo fifa_version fictícios
    // usados por outros testes, ex.: 9999 em game-data.test.ts).
    const count = (db.prepare('SELECT COUNT(*) AS c FROM sofifa_players WHERE fifa_version < 9000').get() as { c: number }).c
    expect(count).toBe(0)
  })
})
