// ---------------------------------------------------------------------------
//  gateway/device-auth — Payload builder for device authentication
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest'
import { buildDeviceAuthPayload } from '@/lib/gateway/device-auth'

describe('buildDeviceAuthPayload', () => {
  it('builds v2 payload with all fields', () => {
    const result = buildDeviceAuthPayload({
      deviceId: 'dev-1',
      clientId: 'openclaw-control-ui',
      clientMode: 'webchat',
      role: 'operator',
      scopes: ['operator.admin', 'operator.approvals'],
      signedAtMs: 1709654400000,
      token: 'tok-abc',
      nonce: 'nonce-xyz',
    })

    expect(result).toBe(
      'v2|dev-1|openclaw-control-ui|webchat|operator|operator.admin,operator.approvals|1709654400000|tok-abc|nonce-xyz',
    )
  })

  it('uses empty string when token is null', () => {
    const result = buildDeviceAuthPayload({
      deviceId: 'd1',
      clientId: 'c1',
      clientMode: 'm1',
      role: 'r1',
      scopes: [],
      signedAtMs: 0,
      token: null,
      nonce: 'n1',
    })

    expect(result).toBe('v2|d1|c1|m1|r1||0||n1')
  })

  it('uses empty string when token is undefined', () => {
    const result = buildDeviceAuthPayload({
      deviceId: 'd1',
      clientId: 'c1',
      clientMode: 'm1',
      role: 'r1',
      scopes: ['s1'],
      signedAtMs: 123,
      nonce: 'n1',
    })

    expect(result).toContain('|s1|123||n1')
  })
})
