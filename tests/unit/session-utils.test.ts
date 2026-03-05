// ---------------------------------------------------------------------------
//  sessions/utils — Pure function tests (Phase 1)
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest'
import { buildSessionTree, extractAgentId, getDisplayName, isActive, sessionLabel } from '@/app/sessions/utils'
import type { GatewaySessionRow } from '@/lib/gateway/types'

function makeSession(key: string, overrides: Partial<GatewaySessionRow> = {}): GatewaySessionRow {
  return {
    key,
    kind: 'direct',
    updatedAt: Date.now(),
    ...overrides,
  }
}

// ===========================================================================
//  extractAgentId
// ===========================================================================

describe('extractAgentId', () => {
  it('extracts agent id from standard key', () => {
    expect(extractAgentId('agent:mybot:main')).toBe('mybot')
  })

  it('extracts agent id from sub-session key', () => {
    expect(extractAgentId('agent:researcher:sub:task-1')).toBe('researcher')
  })

  it('returns "unknown" for non-agent key', () => {
    expect(extractAgentId('global:config')).toBe('unknown')
  })

  it('returns "unknown" for empty string', () => {
    expect(extractAgentId('')).toBe('unknown')
  })
})

// ===========================================================================
//  sessionLabel
// ===========================================================================

describe('sessionLabel', () => {
  it('returns part after second colon for standard key', () => {
    expect(sessionLabel('agent:mybot:main')).toBe('main')
  })

  it('joins remaining parts for deep keys', () => {
    expect(sessionLabel('agent:mybot:sub:task-1')).toBe('sub:task-1')
  })

  it('returns full key when fewer than 3 parts', () => {
    expect(sessionLabel('short:key')).toBe('short:key')
  })

  it('returns full key for single segment', () => {
    expect(sessionLabel('standalone')).toBe('standalone')
  })
})

// ===========================================================================
//  getDisplayName
// ===========================================================================

describe('getDisplayName', () => {
  it('returns displayName when set', () => {
    expect(getDisplayName(makeSession('agent:bot:main', { displayName: 'My Bot' }))).toBe('My Bot')
  })

  it('falls back to label', () => {
    expect(getDisplayName(makeSession('agent:bot:main', { label: 'bot-label' }))).toBe('bot-label')
  })

  it('falls back to last segment of key', () => {
    expect(getDisplayName(makeSession('agent:bot:main'))).toBe('main')
  })

  it('falls back to full key if no segments', () => {
    expect(getDisplayName(makeSession('standalone'))).toBe('standalone')
  })
})

// ===========================================================================
//  isActive
// ===========================================================================

describe('isActive', () => {
  it('returns true for recently updated session', () => {
    expect(isActive(makeSession('k', { updatedAt: Date.now() }))).toBe(true)
  })

  it('returns false for stale session', () => {
    expect(isActive(makeSession('k', { updatedAt: Date.now() - 600_000 }))).toBe(false)
  })

  it('returns false for null updatedAt', () => {
    expect(isActive(makeSession('k', { updatedAt: null }))).toBe(false)
  })
})

// ===========================================================================
//  buildSessionTree
// ===========================================================================

describe('buildSessionTree', () => {
  it('returns empty array for empty input', () => {
    expect(buildSessionTree([])).toEqual([])
  })

  it('puts all sessions as roots when no parent relationship', () => {
    const sessions = [makeSession('agent:a:main'), makeSession('agent:b:main')]
    const tree = buildSessionTree(sessions)
    expect(tree).toHaveLength(2)
  })

  it('nests sub-sessions under their main session', () => {
    const sessions = [
      makeSession('agent:bot:main'),
      makeSession('agent:bot:sub:task-1'),
    ]
    const tree = buildSessionTree(sessions)
    expect(tree).toHaveLength(1)
    expect(tree[0].session.key).toBe('agent:bot:main')
    expect(tree[0].children).toHaveLength(1)
    expect(tree[0].children[0].session.key).toBe('agent:bot:sub:task-1')
    expect(tree[0].children[0].depth).toBe(1)
  })

  it('keeps sub-session as root if main does not exist', () => {
    const sessions = [makeSession('agent:bot:sub:task-1')]
    const tree = buildSessionTree(sessions)
    expect(tree).toHaveLength(1)
    expect(tree[0].depth).toBe(0)
  })
})
