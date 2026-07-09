import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { kaggleCreds } from '../settings.js'
import { csvFilesPresent, importFromCsv, PLAYERS_CSV, TEAMS_CSV } from '../sofifa/kaggle-csv.js'
import { downloadDatasetFile } from '../sofifa/kaggle-download.js'
import { KNOWN_VERSIONS } from '../sofifa/source.js'

/** Job de importação em memória — um por vez; progresso consultado por polling. */
interface ImportState {
  running: boolean
  phase: 'ocioso' | 'baixando' | 'preparando' | 'importando' | 'concluído' | 'erro'
  detail: string
  versions: number[]
  progress: number | null // 0..1 quando conhecido
  error: string | null
  finishedAt: string | null
}

const state: ImportState = {
  running: false,
  phase: 'ocioso',
  detail: '',
  versions: [],
  progress: null,
  error: null,
  finishedAt: null,
}

async function runImport(versions: number[]) {
  state.running = true
  state.phase = 'baixando'
  state.detail = ''
  state.versions = versions
  state.progress = null
  state.error = null
  state.finishedAt = null
  try {
    const present = csvFilesPresent()
    const missing = [...(present.teams ? [] : ['male_teams.csv']), ...(present.players ? [] : ['male_players.csv'])]
    if (missing.length) {
      const creds = kaggleCreds() // opcional: dataset público baixa sem autenticação
      for (const file of missing) {
        await downloadDatasetFile(creds, file, (p) => {
          state.phase = 'baixando'
          state.detail = `${file} — ${(p.bytes / 1e6).toFixed(0)} MB${p.totalBytes ? ` de ${(p.totalBytes / 1e6).toFixed(0)} MB` : ''}`
          state.progress = p.totalBytes ? p.bytes / p.totalBytes : null
        })
      }
    }

    state.phase = 'preparando'
    state.detail = 'Lendo os arquivos (isso demora alguns minutos na primeira vez)…'
    state.progress = null
    await importFromCsv(versions, (p) => {
      state.phase = p.phase === 'preparando' ? 'preparando' : 'importando'
      state.detail = p.phase === 'preparando' ? state.detail : `${p.phase}: ${p.rows.toLocaleString('pt-BR')} registros`
    })

    state.phase = 'concluído'
    state.detail = `FIFA ${versions.join(', ')} importado com os dados originais do jogo.`
  } catch (e) {
    state.phase = 'erro'
    state.error = e instanceof Error ? e.message : String(e)
  } finally {
    state.running = false
    state.finishedAt = new Date().toISOString()
  }
}

export function importRoutes(app: FastifyInstance) {
  app.post('/api/import', (req, reply) => {
    if (state.running) return reply.code(409).send({ error: 'Já existe uma importação em andamento.' })
    const { versions } = z.object({ versions: z.array(z.number().int()).min(1) }).parse(req.body ?? {})
    const valid = versions.filter((v) => (KNOWN_VERSIONS as readonly number[]).includes(v))
    if (!valid.length) return reply.code(400).send({ error: 'Nenhuma versão válida (15–24).' })
    void runImport(valid)
    return { started: true, versions: valid }
  })

  app.get('/api/import/status', () => ({
    ...state,
    csv: csvFilesPresent(),
    paths: { players: PLAYERS_CSV, teams: TEAMS_CSV },
  }))
}
