import type { FastifyBaseLogger } from 'fastify'
import { db } from '../db/index.js'
import { hashPassword } from './passwords.js'

/**
 * Bootstrap do primeiro admin: se não há nenhum usuário e ADMIN_EMAIL/ADMIN_PASSWORD
 * estão no ambiente, cria o admin no boot. Depois do primeiro boot as envs podem
 * (e devem) ser removidas — não há re-seed com usuários existentes.
 */
export function seedAdminIfEmpty(log: FastifyBaseLogger) {
  const count = (db.prepare(`SELECT COUNT(*) AS c FROM users`).get() as { c: number }).c
  if (count > 0) return

  const email = process.env.ADMIN_EMAIL?.trim()
  const password = process.env.ADMIN_PASSWORD
  if (!email || !password) {
    log.warn('Nenhum usuário cadastrado e ADMIN_EMAIL/ADMIN_PASSWORD ausentes — ninguém conseguirá logar até o seed do primeiro admin.')
    return
  }

  const { salt, hash } = hashPassword(password)
  db.prepare(
    `INSERT INTO users (email, display_name, password_hash, salt, role) VALUES (?, ?, ?, ?, 'admin')`,
  ).run(email, email.split('@')[0], hash, salt)
  log.warn(`Primeiro admin criado a partir do ambiente: ${email}. Remova ADMIN_EMAIL/ADMIN_PASSWORD do ambiente após confirmar o login.`)
}
