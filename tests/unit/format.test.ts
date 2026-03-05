// ---------------------------------------------------------------------------
//  lib/format — Token and relative time formatting
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest'
import { formatRelativeTime, formatTokens } from '@/lib/format'

// ===========================================================================
//  formatTokens
// ===========================================================================

describe('formatTokens', () => {
  const cases = [
    { input: 0, expected: '0' },
    { input: 999, expected: '999' },
    { input: 1_000, expected: '1.0k' },
    { input: 45_300, expected: '45.3k' },
    { input: 1_000_000, expected: '1.0M' },
    { input: 1_200_000, expected: '1.2M' },
  ] as const

  for (const { input, expected } of cases) {
    it(`${input} → "${expected}"`, () => {
      expect(formatTokens(input)).toBe(expected)
    })
  }
})

// ===========================================================================
//  formatRelativeTime
// ===========================================================================

describe('formatRelativeTime', () => {
  it('returns "just now" for recent timestamps', () => {
    expect(formatRelativeTime(Date.now() - 30_000)).toBe('just now')
  })

  it('formats minutes ago', () => {
    expect(formatRelativeTime(Date.now() - 300_000)).toBe('5m ago')
  })

  it('formats hours ago', () => {
    expect(formatRelativeTime(Date.now() - 7_200_000)).toBe('2h ago')
  })

  it('formats days ago', () => {
    expect(formatRelativeTime(Date.now() - 172_800_000)).toBe('2d ago')
  })
})
