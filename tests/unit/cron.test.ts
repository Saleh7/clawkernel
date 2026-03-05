// ---------------------------------------------------------------------------
//  lib/cron — Schedule formatting, delivery, failure diagnosis
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest'
import {
  buildFailureGuide,
  cronToHuman,
  describeDelivery,
  formatDate,
  formatDuration,
  formatFullDate,
  formatRelative,
  formatSchedule,
} from '@/lib/cron'
import type { CronJob, CronSchedule } from '@/lib/gateway/types'

// ===========================================================================
//  formatRelative
// ===========================================================================

describe('formatRelative', () => {
  it('returns "—" for falsy input', () => {
    expect(formatRelative(undefined)).toBe('—')
    expect(formatRelative(null)).toBe('—')
    expect(formatRelative(0)).toBe('—')
  })

  it('formats past timestamps', () => {
    const now = Date.now()
    expect(formatRelative(now - 10_000)).toBe('just now')
    expect(formatRelative(now - 120_000)).toBe('2m ago')
    expect(formatRelative(now - 7_200_000)).toBe('2h ago')
    expect(formatRelative(now - 172_800_000)).toBe('2d ago')
  })

  it('formats future timestamps', () => {
    const now = Date.now()
    expect(formatRelative(now + 30_000)).toMatch(/^in \d+s$/)
    expect(formatRelative(now + 120_000)).toMatch(/^in \d+m$/)
    expect(formatRelative(now + 7_200_000)).toMatch(/^in \d+h$/)
    expect(formatRelative(now + 172_800_000)).toMatch(/^in \d+d$/)
  })
})

// ===========================================================================
//  formatDuration
// ===========================================================================

describe('formatDuration', () => {
  const cases = [
    { input: undefined, expected: '—' },
    { input: null, expected: '—' },
    { input: 500, expected: '500ms' },
    { input: 2500, expected: '2.5s' },
    { input: 90_000, expected: '1.5m' },
  ] as const

  for (const { input, expected } of cases) {
    it(`formats ${input} as "${expected}"`, () => {
      expect(formatDuration(input as number | undefined)).toBe(expected)
    })
  }
})

// ===========================================================================
//  formatDate / formatFullDate
// ===========================================================================

describe('formatDate', () => {
  it('returns "—" for falsy input', () => {
    expect(formatDate(undefined, true)).toBe('—')
    expect(formatDate(0, true)).toBe('—')
  })

  it('returns a formatted string for valid timestamps', () => {
    const result = formatDate(Date.now(), true)
    expect(result.length).toBeGreaterThan(5)
  })
})

describe('formatFullDate', () => {
  it('returns "—" for falsy input', () => {
    expect(formatFullDate(undefined, false)).toBe('—')
  })

  it('includes weekday in output', () => {
    const result = formatFullDate(Date.now(), false)
    expect(result).toMatch(/Mon|Tue|Wed|Thu|Fri|Sat|Sun/)
  })
})

// ===========================================================================
//  cronToHuman
// ===========================================================================

describe('cronToHuman', () => {
  const cases = [
    { expr: '*/5 * * * *', expected: 'Every 5 minutes' },
    { expr: '*/1 * * * *', expected: 'Every minute' },
    { expr: '0 */2 * * *', expected: 'Every 2 hours' },
    { expr: '0 */1 * * *', expected: 'Every hour' },
    { expr: '0 * * * *', expected: 'Every hour' },
    { expr: '0 9 * * *', expected: 'Daily at 09:00' },
    { expr: '30 14 * * *', expected: 'Daily at 14:30' },
    { expr: '0 9 * * 1-5', expected: 'Weekdays at 09:00' },
    { expr: '0 10 * * 1', expected: 'Every Mon at 10:00' },
    { expr: '0 8,20 * * *', expected: 'Twice a day (08:00 & 20:00)' },
  ] as const

  for (const { expr, expected } of cases) {
    it(`"${expr}" → "${expected}" (24h)`, () => {
      expect(cronToHuman(expr, true)).toBe(expected)
    })
  }

  it('returns raw expression for non-matching patterns', () => {
    expect(cronToHuman('0 0 1 1 *', true)).toBe('0 0 1 1 *')
  })

  it('returns raw expression for short input', () => {
    expect(cronToHuman('* *', true)).toBe('* *')
  })

  it('formats 12h clock when is24h=false', () => {
    const result = cronToHuman('30 14 * * *', false)
    expect(result).toContain('2:30 PM')
  })
})

// ===========================================================================
//  formatSchedule
// ===========================================================================

describe('formatSchedule', () => {
  it('formats cron schedule with timezone', () => {
    const s: CronSchedule = { kind: 'cron', expr: '0 9 * * *', tz: 'Asia/Riyadh' } as CronSchedule
    const result = formatSchedule(s, true)
    expect(result.label).toBe('Daily at 09:00 (Asia/Riyadh)')
    expect(result.kind).toBe('cron')
  })

  it('formats every-ms schedule', () => {
    const cases = [
      { everyMs: 30_000, expected: 'Every 30s' },
      { everyMs: 300_000, expected: 'Every 5m' },
      { everyMs: 7_200_000, expected: 'Every 2.0h' },
    ] as const

    for (const { everyMs, expected } of cases) {
      const s = { kind: 'every', everyMs } as CronSchedule
      expect(formatSchedule(s, true).label).toBe(expected)
    }
  })

  it('formats one-shot "at" schedule', () => {
    const s = { kind: 'at', at: Date.now() } as CronSchedule
    const result = formatSchedule(s, true)
    expect(result.kind).toBe('one-shot')
  })

  it('returns "—" for unknown kind', () => {
    const s = { kind: 'unknown' } as unknown as CronSchedule
    expect(formatSchedule(s, true).label).toBe('—')
  })
})

// ===========================================================================
//  describeDelivery
// ===========================================================================

describe('describeDelivery', () => {
  it('returns "No delivery" for mode=none', () => {
    const job = { delivery: { mode: 'none' } } as CronJob
    expect(describeDelivery(job)).toEqual({ label: 'No delivery', hasIssue: false })
  })

  it('returns "No delivery" for missing delivery', () => {
    expect(describeDelivery({} as CronJob)).toEqual({ label: 'No delivery', hasIssue: false })
  })

  it('includes channel and target in label', () => {
    const job = { delivery: { mode: 'announce', channel: 'telegram', to: 'group-1' } } as CronJob
    const result = describeDelivery(job)
    expect(result.label).toContain('telegram')
    expect(result.label).toContain('group-1')
    expect(result.hasIssue).toBe(false)
  })

  it('flags missing target for announce mode', () => {
    const job = { delivery: { mode: 'announce' } } as CronJob
    const result = describeDelivery(job)
    expect(result.hasIssue).toBe(true)
    expect(result.issue).toBeDefined()
  })
})

// ===========================================================================
//  buildFailureGuide
// ===========================================================================

describe('buildFailureGuide', () => {
  const cases = [
    { error: 'delivery target is missing', headline: 'Delivery destination is missing' },
    { error: 'delivery to missing', headline: 'Delivery destination is missing' },
    { error: 'Unauthorized: invalid api key', headline: 'Provider authentication failed' },
    { error: 'authentication failed', headline: 'Provider authentication failed' },
    { error: 'model not found: gpt-5', headline: 'Selected model is unavailable' },
    { error: 'model unavailable', headline: 'Selected model is unavailable' },
    { error: 'request timed out after 30s', headline: 'The job timed out' },
    { error: 'ECONNREFUSED 127.0.0.1:11434', headline: 'Connection to a required service failed' },
    { error: 'DNS resolution failed', headline: 'Connection to a required service failed' },
    { error: 'some unknown error happened', headline: 'The run failed' },
  ] as const

  for (const { error, headline } of cases) {
    it(`"${error.slice(0, 40)}…" → "${headline}"`, () => {
      const guide = buildFailureGuide(error)
      expect(guide.headline).toBe(headline)
      expect(guide.explanation.length).toBeGreaterThan(0)
      expect(guide.steps.length).toBeGreaterThan(0)
    })
  }

  it('includes channel hint when delivery has channel', () => {
    const guide = buildFailureGuide('delivery target is missing', { mode: 'announce', channel: 'telegram' } as CronJob['delivery'])
    expect(guide.steps.some((s) => s.includes('telegram'))).toBe(true)
  })
})
