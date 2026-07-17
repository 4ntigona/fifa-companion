import { createHash, randomBytes } from 'node:crypto'
import { db } from '../db/index.js'

export const SESSION_COOKIE = 'sid'
export const SESSION_DAYS = 90

export interface SessionUser {
  id: number
  email: string
  displayName: string | null
  role: 'admin' | 'user'
  mustChangePassword: boolean
}

// No banco fica só o SHA-256 — vazamento do SQLite não vaza sessões utilizáveis.
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

export function createSession(userId: number): string {
  const token = randomBytes(32).toString('base64url')
  db.prepare(
    `INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, datetime('now', '+${SESSION_DAYS} days'))`,
  ).run(hashToken(token), userId)
  return token
}

/** Valida o token e desliza a expiração (sessão de longa duração para o PWA no celular). */
export function lookupSession(token: string): SessionUser | null {
  const tokenHash = hashToken(token)
  const row = db.prepare(
    `SELECT u.id, u.email, u.display_name, u.role, u.must_change_password
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > datetime('now') AND u.active = 1`,
  ).get(tokenHash) as
    | { id: number; email: string; display_name: string | null; role: 'admin' | 'user'; must_change_password: number }
    | undefined
  if (!row) return null
  db.prepare(`UPDATE sessions SET expires_at = datetime('now', '+${SESSION_DAYS} days') WHERE token_hash = ?`).run(tokenHash)
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    mustChangePassword: Boolean(row.must_change_password),
  }
}

export function revokeSession(token: string) {
  db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(hashToken(token))
}

/** Derruba todas as sessões de um usuário (troca de senha, desativação, admin). */
export function revokeUserSessions(userId: number) {
  db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(userId)
}

export function pruneExpiredSessions(): number {
  return db.prepare(`DELETE FROM sessions WHERE expires_at <= datetime('now')`).run().changes
}
