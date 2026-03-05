// ---------------------------------------------------------------------------
//  agents/utils — Agent ID normalization, emoji/name resolution, model labels
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest'
import { normalizeAgentId, resolveAgentEmoji, resolveAgentName, resolveModelLabel } from '@/app/agents/utils'
import type { GatewayAgentRow } from '@/lib/gateway/types'

function makeAgent(id: string, overrides: Partial<GatewayAgentRow> = {}): GatewayAgentRow {
  return { id, ...overrides }
}

// ===========================================================================
//  normalizeAgentId
// ===========================================================================

describe('normalizeAgentId', () => {
  const cases = [
    { input: 'My Agent', expected: 'my-agent' },
    { input: 'test_bot-v2', expected: 'test_bot-v2' },
    { input: '---spaces---', expected: 'spaces' },
    { input: 'UPPER CASE!', expected: 'upper-case' },
    { input: 'a@b#c$d', expected: 'a-b-c-d' },
  ] as const

  for (const { input, expected } of cases) {
    it(`"${input}" → "${expected}"`, () => {
      expect(normalizeAgentId(input)).toBe(expected)
    })
  }
})

// ===========================================================================
//  resolveAgentName
// ===========================================================================

describe('resolveAgentName', () => {
  it('prefers identity name over agent name', () => {
    expect(resolveAgentName(makeAgent('bot', { name: 'Bot' }), { name: 'Custom Name' })).toBe('Custom Name')
  })

  it('falls back to agent.identity.name', () => {
    expect(resolveAgentName(makeAgent('bot', { identity: { name: 'Identity Name' } }))).toBe('Identity Name')
  })

  it('falls back to agent.name', () => {
    expect(resolveAgentName(makeAgent('bot', { name: 'Agent Name' }))).toBe('Agent Name')
  })

  it('falls back to agent.id', () => {
    expect(resolveAgentName(makeAgent('bot-id'))).toBe('bot-id')
  })
})

// ===========================================================================
//  resolveAgentEmoji
// ===========================================================================

describe('resolveAgentEmoji', () => {
  it('returns identity emoji when valid', () => {
    expect(resolveAgentEmoji(makeAgent('bot'), { emoji: '🤖' })).toBe('🤖')
  })

  it('falls back to agent.identity.emoji', () => {
    expect(resolveAgentEmoji(makeAgent('bot', { identity: { emoji: '🦞' } }))).toBe('🦞')
  })

  it('rejects URLs as emoji', () => {
    expect(resolveAgentEmoji(makeAgent('bot'), { emoji: 'https://example.com/avatar.png' })).toBe('')
  })

  it('rejects paths as emoji', () => {
    expect(resolveAgentEmoji(makeAgent('bot'), { emoji: '/img/avatar.png' })).toBe('')
  })

  it('rejects long strings', () => {
    expect(resolveAgentEmoji(makeAgent('bot'), { emoji: 'this is way too long to be an emoji' })).toBe('')
  })

  it('returns empty string when no emoji found', () => {
    expect(resolveAgentEmoji(makeAgent('bot'))).toBe('')
  })
})

// ===========================================================================
//  resolveModelLabel
// ===========================================================================

describe('resolveModelLabel', () => {
  it('returns string model as-is', () => {
    expect(resolveModelLabel('anthropic/claude-sonnet-4-6')).toBe('anthropic/claude-sonnet-4-6')
  })

  it('returns "unassigned" for falsy values', () => {
    expect(resolveModelLabel(null)).toBe('unassigned')
    expect(resolveModelLabel(undefined)).toBe('unassigned')
    expect(resolveModelLabel('')).toBe('unassigned')
  })

  it('handles object with primary model', () => {
    expect(resolveModelLabel({ primary: 'gpt-4o' })).toBe('gpt-4o')
  })

  it('includes fallback count', () => {
    expect(resolveModelLabel({ primary: 'gpt-4o', fallbacks: ['claude-sonnet'] })).toBe('gpt-4o (+1 fallback)')
  })

  it('returns "unassigned" for object without primary', () => {
    expect(resolveModelLabel({})).toBe('unassigned')
  })
})
