import Database from 'better-sqlite3'
import { readFileSync, existsSync } from 'node:fs'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
export const DATA_DIR = join(here, '..', '..', 'data')
mkdirSync(DATA_DIR, { recursive: true })
mkdirSync(join(DATA_DIR, 'captures'), { recursive: true })

export const db = new Database(join(DATA_DIR, 'companion.db'))
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

const schemaPath = existsSync(join(here, 'schema.sql'))
  ? join(here, 'schema.sql')
  : join(here, '..', '..', 'src', 'db', 'schema.sql')
const schema = readFileSync(schemaPath, 'utf-8')
db.exec(schema)
