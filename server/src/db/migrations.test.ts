import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runMigrations } from './index.js'

const here = dirname(fileURLToPath(import.meta.url))
const migrationsDir = join(here, 'migrations')

function freshDb() {
  const d = new Database(':memory:')
  d.pragma('foreign_keys = ON')
  return d
}

describe('runner de migrations', () => {
  it('aplica todas as migrations num banco novo e é idempotente', () => {
    const d = freshDb()
    runMigrations(d, migrationsDir)
    const tables = d.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all().map((r: any) => r.name)
    expect(tables).toContain('users')
    expect(tables).toContain('sessions')
    expect(tables).toContain('careers')
    expect(tables).toContain('sofifa_players')
    // segunda execução é no-op
    expect(() => runMigrations(d, migrationsDir)).not.toThrow()
  })

  it('é no-op sobre um banco criado pelo schema antigo (pré-migrations) e preserva dados do jogo', () => {
    // Simula a base de produção: schema histórico aplicado direto, sem schema_migrations.
    const d = freshDb()
    d.exec(readFileSync(join(migrationsDir, '001-baseline.sql'), 'utf-8'))
    d.prepare(
      `INSERT INTO sofifa_players (fifa_version, player_id, short_name, long_name, positions, overall, potential, age, attributes_json)
       VALUES (16, 158023, 'L. Messi', 'Lionel Messi', 'RW', 94, 95, 28, '{}')`,
    ).run()

    runMigrations(d, migrationsDir)

    // dados do jogo intocados (invariante)
    const p = d.prepare(`SELECT overall FROM sofifa_players WHERE player_id = 158023`).get() as { overall: number }
    expect(p.overall).toBe(94)
    // novo modelo presente; careers agora exige user_id
    const cols = d.prepare(`PRAGMA table_info(careers)`).all().map((r: any) => r.name)
    expect(cols).toContain('user_id')
    // todas as migrations registradas (001 baseline, 002 contas, 003 conselheiro, 004 drop sync…)
    const applied = d.prepare(`SELECT id FROM schema_migrations ORDER BY id`).all().map((r: any) => r.id)
    expect(applied).toEqual([1, 2, 3, 4])
    const tables = d.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all().map((r: any) => r.name)
    // o conselheiro (003) foi criado por cima do schema antigo
    expect(tables).toContain('advisor_reports')
    // e a 004 removeu o resto do modelo pré-contas, mesmo tendo vindo do schema antigo
    expect(tables).not.toContain('sync_blobs')
  })

  it('careers sem user_id é rejeitado (NOT NULL + FK)', () => {
    const d = freshDb()
    runMigrations(d, migrationsDir)
    expect(() =>
      d.prepare(`INSERT INTO careers (name, fifa_version, team_type) VALUES ('x', 16, 'existing')`).run(),
    ).toThrow()
  })
})
