/**
 * Download dos dumps direto pela API REST do Kaggle (basic auth com username + key),
 * sem depender do CLI/Python. Arquivos chegam zipados; extraímos com o unzip do macOS.
 */
import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { open } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { DATASET, KAGGLE_DIR } from './kaggle-csv.js'

export interface DownloadProgress {
  file: string
  bytes: number
  totalBytes: number | null
}

export async function testKaggleCreds(username: string, key: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`https://www.kaggle.com/api/v1/datasets/view/${DATASET}`, {
      headers: { Authorization: `Basic ${Buffer.from(`${username}:${key}`).toString('base64')}` },
    })
    if (res.ok) return { ok: true }
    return { ok: false, error: res.status === 401 ? 'Credenciais inválidas (401).' : `Kaggle respondeu ${res.status}.` }
  } catch (e) {
    return { ok: false, error: `Sem conexão com o Kaggle: ${e instanceof Error ? e.message : e}` }
  }
}

export async function downloadDatasetFile(
  creds: { username: string; key: string } | null,
  fileName: string,
  onProgress: (p: DownloadProgress) => void,
): Promise<void> {
  mkdirSync(KAGGLE_DIR, { recursive: true })
  const dest = join(KAGGLE_DIR, fileName)
  if (existsSync(dest)) return

  // Dataset público: o download funciona sem autenticação; credenciais são usadas só se configuradas.
  const url = `https://www.kaggle.com/api/v1/datasets/download/${DATASET}/${encodeURIComponent(fileName)}`
  const res = await fetch(url, {
    headers: creds ? { Authorization: `Basic ${Buffer.from(`${creds.username}:${creds.key}`).toString('base64')}` } : {},
  })
  if (!res.ok || !res.body) {
    throw new Error(
      res.status === 401 || res.status === 403
        ? 'Kaggle recusou o acesso — tente configurar (ou corrigir) as credenciais em Configurações.'
        : `Falha no download de ${fileName}: HTTP ${res.status}`,
    )
  }

  const totalBytes = res.headers.get('content-length') ? Number(res.headers.get('content-length')) : null
  const tmp = `${dest}.download`
  let bytes = 0
  const counter = async function* (src: AsyncIterable<Uint8Array>) {
    for await (const chunk of src) {
      bytes += chunk.length
      onProgress({ file: fileName, bytes, totalBytes })
      yield chunk
    }
  }
  await pipeline(counter(Readable.fromWeb(res.body as import('node:stream/web').ReadableStream)), createWriteStream(tmp))

  // Zip (PK\x03\x04) ou o próprio CSV?
  const fh = await open(tmp, 'r')
  const magic = Buffer.alloc(4)
  await fh.read(magic, 0, 4, 0)
  await fh.close()

  if (magic[0] === 0x50 && magic[1] === 0x4b) {
    const zipPath = `${dest}.zip`
    renameSync(tmp, zipPath)
    const r = spawnSync('unzip', ['-o', zipPath, '-d', KAGGLE_DIR], { encoding: 'utf-8' })
    rmSync(zipPath, { force: true })
    if (r.status !== 0 || !existsSync(dest)) {
      throw new Error(`Falha ao extrair ${fileName}: ${r.stderr || r.stdout || 'arquivo esperado não encontrado no zip'}`)
    }
  } else {
    renameSync(tmp, dest)
  }
}
