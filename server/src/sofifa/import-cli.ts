/**
 * CLI de importação da database do jogo.
 *
 *   npm run import:data                  → importa todas as versões (15–24)
 *   npm run import:data -- 16 22         → importa só FIFA 16 e FIFA 22
 *
 * Se os CSVs não existirem em server/data/kaggle/, tenta baixar com o CLI
 * oficial do Kaggle (requer ~/.kaggle/kaggle.json). Alternativa manual:
 * baixar o dataset no site e colocar male_players.csv e male_teams.csv na pasta.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { KNOWN_VERSIONS } from './source.js'
import { csvFilesPresent, importFromCsv, DATASET, KAGGLE_DIR } from './kaggle-csv.js'
import { db } from '../db/index.js'

const args = process.argv.slice(2).map(Number).filter((n) => Number.isFinite(n))
const versions = args.length ? args : [...KNOWN_VERSIONS]

function tryKaggleDownload() {
  const check = spawnSync('kaggle', ['--version'], { encoding: 'utf-8' })
  if (check.error) {
    console.error(
      `\nCSVs não encontrados e o CLI do Kaggle não está instalado.\n` +
      `Opção A (automática):\n` +
      `  1. pip3 install kaggle\n` +
      `  2. kaggle.com → Settings → API → "Create New Token" → salvar em ~/.kaggle/kaggle.json\n` +
      `  3. rodar npm run import:data de novo\n` +
      `Opção B (manual): baixar https://www.kaggle.com/datasets/${DATASET}\n` +
      `  e colocar male_players.csv e male_teams.csv em ${KAGGLE_DIR}\n`,
    )
    process.exit(1)
  }
  console.log(`Baixando dataset ${DATASET} (arquivos male_players.csv e male_teams.csv)…`)
  for (const file of ['male_players.csv', 'male_teams.csv']) {
    const r = spawnSync('kaggle', ['datasets', 'download', DATASET, '-f', file, '-p', KAGGLE_DIR, '--unzip'], {
      stdio: 'inherit',
    })
    if (r.status !== 0) {
      console.error(`Falha ao baixar ${file}. Verifique ~/.kaggle/kaggle.json e sua conexão.`)
      process.exit(1)
    }
  }
}

mkdirSync(KAGGLE_DIR, { recursive: true })
const present = csvFilesPresent()
if (!present.players || !present.teams) tryKaggleDownload()

console.log(`Importando FIFA ${versions.join(', ')} (roster de lançamento de cada versão)…`)
const job = db
  .prepare(`INSERT INTO import_jobs (fifa_version, source, status, started_at) VALUES (?, 'kaggle-csv', 'running', datetime('now'))`)
  .run(versions[0])

try {
  const totals = await importFromCsv(versions, (p) => {
    process.stdout.write(`\r${p.phase}: ${p.rows} registros…      `)
  })
  db.prepare(`UPDATE import_jobs SET status='done', done=?, total=?, finished_at=datetime('now') WHERE id=?`)
    .run(totals.players, totals.players, job.lastInsertRowid)
  console.log(`\nConcluído: ${totals.teams} times e ${totals.players} jogadores importados (dados originais do jogo).`)
} catch (err) {
  db.prepare(`UPDATE import_jobs SET status='error', error=?, finished_at=datetime('now') WHERE id=?`)
    .run(String(err), job.lastInsertRowid)
  console.error(`\nErro: ${err}`)
  process.exit(1)
}
