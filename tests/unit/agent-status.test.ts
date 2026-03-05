// ---------------------------------------------------------------------------
//  lib/agent-status — Live agent status resolution
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest'
import { resolveLiveStatus } from '@/lib/agent-status'

describe('resolveLiveStatus', () => {
  const now = Date.now()

  it('returns "running" when agent has active run', () => {
    const runs = { r1: { sessionKey: 'agent:bot:main', startedAt: now } }
    expect(resolveLiveStatus('bot', runs, [])).toBe('running')
  })

  it('returns "active" for recently updated session', () => {
    const sessions = [{ key: 'agent:bot:main', updatedAt: now - 60_000 }]
    expect(resolveLiveStatus('bot', {}, sessions)).toBe('active')
  })

  it('returns "idle" for stale session', () => {
    const sessions = [{ key: 'agent:bot:main', updatedAt: now - 600_000 }]
    expect(resolveLiveStatus('bot', {}, sessions)).toBe('idle')
  })

  it('returns "inactive" when no sessions exist', () => {
    expect(resolveLiveStatus('bot', {}, [])).toBe('inactive')
  })

  it('ignores sessions from other agents', () => {
    const sessions = [{ key: 'agent:other:main', updatedAt: now }]
    expect(resolveLiveStatus('bot', {}, sessions)).toBe('inactive')
  })

  it('ignores runs from other agents', () => {
    const runs = { r1: { sessionKey: 'agent:other:main', startedAt: now } }
    expect(resolveLiveStatus('bot', runs, [])).toBe('inactive')
  })

  it('"running" takes priority over "active"', () => {
    const runs = { r1: { sessionKey: 'agent:bot:main', startedAt: now } }
    const sessions = [{ key: 'agent:bot:main', updatedAt: now }]
    expect(resolveLiveStatus('bot', runs, sessions)).toBe('running')
  })
})
