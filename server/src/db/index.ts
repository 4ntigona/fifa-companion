import Database from 'better-sqlite3'
import { readFileSync, readdirSync } from 'node:fs'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
// Testes apontam DATA_DIR para um diretório temporário (ver server/vitest.config.ts);
// em produção/dev a env não existe e o default (server/data) permanece.
export const DATA_DIR = process.env.DATA_DIR ?? join(here, '..', '..', 'data')
mkdirSync(DATA_DIR, { recursive: true })
mkdirSync(join(DATA_DIR, 'captures'), { recursive: true })

/**
 * Runner de migrations: aplica migrations/00N-*.sql em ordem, uma transação por
 * arquivo, registrando em schema_migrations. A 001-baseline é o schema histórico
 * (CREATE IF NOT EXISTS em tudo) — numa base existente ela é no-op e só é
 * registrada como aplicada. Migrations NUNCA tocam sofifa_players/sofifa_teams.
 */
export function runMigrations(database: Database.Database, migrationsDir = join(here, 'migrations')) {
  database.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`)
  const applied = new Set(
    (database.prepare(`SELECT id FROM schema_migrations`).all() as { id: number }[]).map((r) => r.id),
  )
  const files = readdirSync(migrationsDir).filter((f) => /^\d+-.*\.sql$/.test(f)).sort()
  for (const file of files) {
    const id = Number(file.split('-')[0])
    if (applied.has(id)) continue
    const sql = readFileSync(join(migrationsDir, file), 'utf-8')
    database.transaction(() => {
      database.exec(sql)
      database.prepare(`INSERT INTO schema_migrations (id, name) VALUES (?, ?)`).run(id, file)
    })()
  }
}

export const db = new Database(join(DATA_DIR, 'companion.db'))
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

runMigrations(db)
