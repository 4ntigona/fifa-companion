import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

// scrypt do node:crypto — sem dependência nativa extra; custo padrão (N=16384)
// é adequado para a escala do app (login raro, poucos usuários).
const KEY_LEN = 64

export function hashPassword(password: string): { salt: string; hash: string } {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, KEY_LEN).toString('hex')
  return { salt, hash }
}

export function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  const candidate = scryptSync(password, salt, KEY_LEN)
  const expected = Buffer.from(expectedHash, 'hex')
  return candidate.length === expected.length && timingSafeEqual(candidate, expected)
}
