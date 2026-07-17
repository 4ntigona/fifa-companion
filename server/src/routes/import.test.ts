import { describe, it, expect } from 'vitest'
import type { FastifyRequest } from 'fastify'
import { isAuthorizedForImport } from './import.js'
import type { SessionUser } from '../auth/sessions.js'

function fakeReq(ip: string, user: SessionUser | null = null): FastifyRequest {
  return { ip, user } as unknown as FastifyRequest
}

const admin: SessionUser = { id: 1, email: 'a@x.com', displayName: null, role: 'admin', mustChangePassword: false }
const regular: SessionUser = { ...admin, id: 2, role: 'user' }

describe('isAuthorizedForImport', () => {
  it('autoriza loopback IPv4', () => {
    expect(isAuthorizedForImport(fakeReq('127.0.0.1'))).toBe(true)
  })

  it('autoriza loopback IPv6', () => {
    expect(isAuthorizedForImport(fakeReq('::1'))).toBe(true)
  })

  it('rejeita origem remota sem sessão', () => {
    expect(isAuthorizedForImport(fakeReq('203.0.113.7'))).toBe(false)
  })

  it('rejeita origem remota com sessão de usuário comum', () => {
    expect(isAuthorizedForImport(fakeReq('203.0.113.7', regular))).toBe(false)
  })

  it('autoriza origem remota com sessão de admin', () => {
    expect(isAuthorizedForImport(fakeReq('203.0.113.7', admin))).toBe(true)
  })
})
