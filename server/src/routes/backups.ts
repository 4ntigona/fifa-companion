import type { FastifyInstance } from 'fastify'
import { db } from '../db/index.js'

function generateCode(): string {
  // 6 caracteres alfanuméricos legíveis, excluindo confusos como 0, O, 1, I
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

export function backupRoutes(app: FastifyInstance) {
  app.post('/api/backups/share', async (req, reply) => {
    const backupJson = JSON.stringify(req.body)
    if (!backupJson || backupJson === '{}') {
      return reply.code(400).send({ error: 'Conteúdo do backup inválido ou vazio.' })
    }

    let code = ''
    let attempts = 0
    while (attempts < 10) {
      const candidate = generateCode()
      const existing = db.prepare('SELECT 1 FROM server_backups WHERE code = ?').get(candidate)
      if (!existing) {
        code = candidate
        break
      }
      attempts++
    }

    if (!code) {
      return reply.code(500).send({ error: 'Falha ao gerar código de backup único.' })
    }

    db.prepare('INSERT INTO server_backups (code, backup_json) VALUES (?, ?)')
      .run(code, backupJson)

    return { code }
  })

  app.get<{ Params: { code: string } }>('/api/backups/recover/:code', async (req, reply) => {
    const code = req.params.code.trim().toUpperCase()
    if (!code) {
      return reply.code(400).send({ error: 'Código de backup inválido.' })
    }

    const row = db.prepare('SELECT backup_json FROM server_backups WHERE code = ?').get(code) as { backup_json: string } | undefined
    if (!row) {
      return reply.code(404).send({ error: 'Backup não encontrado. Verifique o código e tente novamente.' })
    }

    try {
      return JSON.parse(row.backup_json)
    } catch {
      return reply.code(500).send({ error: 'Backup corrompido no servidor.' })
    }
  })
}
