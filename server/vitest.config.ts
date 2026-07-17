import { defineConfig } from 'vitest/config'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Um diretório temporário por execução da suíte — o singleton de db/index.ts
// abre companion.db aqui em vez de na base real de desenvolvimento.
const testDataDir = mkdtempSync(join(tmpdir(), 'fifa-companion-test-'))
process.env.DATA_DIR = testDataDir

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    env: { DATA_DIR: testDataDir },
    // Arquivos em série: cada arquivo importa o singleton do db e roda as
    // migrations no companion.db compartilhado — em paralelo isso corrompe/trava.
    fileParallelism: false,
  },
})
