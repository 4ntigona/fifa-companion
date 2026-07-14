import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyRequest } from 'fastify'
import { isAuthorizedForImport } from './import.js'

function fakeReq(ip: string, headers: Record<string, string> = {}): FastifyRequest {
  return { ip, headers } as unknown as FastifyRequest
}

describe('isAuthorizedForImport', () => {
  const originalToken = process.env.ADMIN_TOKEN

  beforeEach(() => { delete process.env.ADMIN_TOKEN })
  afterEach(() => { process.env.ADMIN_TOKEN = originalToken })

  it('autoriza loopback IPv4', () => {
    expect(isAuthorizedForImport(fakeReq('127.0.0.1'))).toBe(true)
  })

  it('autoriza loopback IPv6', () => {
    expect(isAuthorizedForImport(fakeReq('::1'))).toBe(true)
  })

  it('rejeita origem remota sem ADMIN_TOKEN configurado', () => {
    expect(isAuthorizedForImport(fakeReq('203.0.113.7'))).toBe(false)
  })

  it('rejeita origem remota com token errado', () => {
    process.env.ADMIN_TOKEN = 'segredo-correto'
    expect(isAuthorizedForImport(fakeReq('203.0.113.7', { 'x-admin-token': 'chute' }))).toBe(false)
  })

  it('autoriza origem remota com o token correto', () => {
    process.env.ADMIN_TOKEN = 'segredo-correto'
    expect(isAuthorizedForImport(fakeReq('203.0.113.7', { 'x-admin-token': 'segredo-correto' }))).toBe(true)
  })
})
