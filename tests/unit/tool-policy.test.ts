// ---------------------------------------------------------------------------
//  agents/tool-policy — Tool name normalization, group expansion, access control
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest'
import { normalizeToolName, resolveToolAllowed, resolveToolProfilePolicy } from '@/app/agents/tool-policy'

// ===========================================================================
//  normalizeToolName
// ===========================================================================

describe('normalizeToolName', () => {
  it('lowercases and trims', () => {
    expect(normalizeToolName('  Web_Search  ')).toBe('web_search')
  })

  it('resolves aliases', () => {
    expect(normalizeToolName('bash')).toBe('exec')
    expect(normalizeToolName('apply-patch')).toBe('apply_patch')
  })

  it('passes through unknown names', () => {
    expect(normalizeToolName('custom_tool')).toBe('custom_tool')
  })
})

// ===========================================================================
//  resolveToolProfilePolicy
// ===========================================================================

describe('resolveToolProfilePolicy', () => {
  it('returns policy for known profiles', () => {
    expect(resolveToolProfilePolicy('minimal')).toBeDefined()
    expect(resolveToolProfilePolicy('coding')).toBeDefined()
    expect(resolveToolProfilePolicy('messaging')).toBeDefined()
    expect(resolveToolProfilePolicy('full')).toBeDefined()
  })

  it('returns undefined for unknown profile', () => {
    expect(resolveToolProfilePolicy('nonexistent')).toBeUndefined()
  })

  it('minimal profile only allows session_status', () => {
    const policy = resolveToolProfilePolicy('minimal')
    expect(policy?.allow).toEqual(['session_status'])
  })
})

// ===========================================================================
//  resolveToolAllowed
// ===========================================================================

describe('resolveToolAllowed', () => {
  describe('no base policy (full access)', () => {
    it('allows any tool', () => {
      const result = resolveToolAllowed('web_search', undefined, [], [])
      expect(result.allowed).toBe(true)
      expect(result.baseAllowed).toBe(true)
      expect(result.denied).toBe(false)
    })

    it('respects deny list', () => {
      const result = resolveToolAllowed('exec', undefined, [], ['exec'])
      expect(result.allowed).toBe(false)
      expect(result.denied).toBe(true)
    })
  })

  describe('with base policy', () => {
    const minimalPolicy = resolveToolProfilePolicy('minimal')!

    it('blocks tools not in allow list', () => {
      const result = resolveToolAllowed('exec', minimalPolicy, [], [])
      expect(result.allowed).toBe(false)
      expect(result.baseAllowed).toBe(false)
    })

    it('allows tools in allow list', () => {
      const result = resolveToolAllowed('session_status', minimalPolicy, [], [])
      expect(result.allowed).toBe(true)
    })

    it('alsoAllow overrides base policy restriction', () => {
      const result = resolveToolAllowed('exec', minimalPolicy, ['exec'], [])
      expect(result.allowed).toBe(true)
      expect(result.baseAllowed).toBe(false)
    })

    it('deny takes priority over alsoAllow', () => {
      const result = resolveToolAllowed('exec', minimalPolicy, ['exec'], ['exec'])
      expect(result.allowed).toBe(false)
      expect(result.denied).toBe(true)
    })
  })

  describe('group expansion', () => {
    it('expands group:fs to individual tools', () => {
      const result = resolveToolAllowed('read', undefined, [], ['group:fs'])
      expect(result.denied).toBe(true)
      expect(result.allowed).toBe(false)
    })

    it('expands group:web', () => {
      const result = resolveToolAllowed('web_search', undefined, [], ['group:web'])
      expect(result.denied).toBe(true)
    })
  })

  describe('alias resolution', () => {
    it('bash resolves to exec', () => {
      const codingPolicy = resolveToolProfilePolicy('coding')!
      const result = resolveToolAllowed('bash', codingPolicy, [], [])
      expect(result.allowed).toBe(true)
    })

    it('apply_patch inherits from exec in allow list', () => {
      const policy = { allow: ['exec'] }
      const result = resolveToolAllowed('apply_patch', policy, [], [])
      expect(result.allowed).toBe(true)
    })
  })

  describe('glob patterns', () => {
    it('matches wildcard in deny', () => {
      const result = resolveToolAllowed('web_search', undefined, [], ['web_*'])
      expect(result.denied).toBe(true)
    })

    it('matches wildcard in alsoAllow', () => {
      const minimalPolicy = resolveToolProfilePolicy('minimal')!
      const result = resolveToolAllowed('web_fetch', minimalPolicy, ['web_*'], [])
      expect(result.allowed).toBe(true)
    })

    it('star alone matches everything', () => {
      const result = resolveToolAllowed('anything', undefined, [], ['*'])
      expect(result.denied).toBe(true)
    })
  })
})
