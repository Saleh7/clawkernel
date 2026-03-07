import { describe, expect, it } from 'vitest'
import type { SessionUsageEntry } from '@/app/usage/types'
import { buildUsageOverviewStats } from '@/app/usage/analytics'
import {
  buildAgentRows,
  buildDateInterpretationParams,
  buildModelRows,
  filterSessionsByPeriod,
  formatCost,
  formatUtcOffset,
  getUsagePresetRange,
  getUsageRangePreset,
  isLegacyDateInterpretationUnsupportedError,
  resolveContextPercent,
} from '@/app/usage/utils'

function makeSession(overrides: Partial<SessionUsageEntry> = {}): SessionUsageEntry {
  return {
    key: 'agent:alpha:main',
    agentId: 'alpha',
    usage: {
      input: 10,
      output: 5,
      cacheRead: 2,
      cacheWrite: 1,
      totalTokens: 18,
      totalCost: 0.75,
      inputCost: 0.3,
      outputCost: 0.35,
      cacheReadCost: 0.05,
      cacheWriteCost: 0.05,
      missingCostEntries: 0,
      lastActivity: 1_000,
      modelUsage: [
        {
          provider: 'openai',
          model: 'gpt-4o',
          count: 1,
          totals: {
            input: 10,
            output: 5,
            cacheRead: 2,
            cacheWrite: 1,
            totalTokens: 18,
            totalCost: 0.75,
            inputCost: 0.3,
            outputCost: 0.35,
            cacheReadCost: 0.05,
            cacheWriteCost: 0.05,
            missingCostEntries: 0,
          },
        },
      ],
      latency: {
        count: 2,
        avgMs: 150,
        p95Ms: 180,
        minMs: 120,
        maxMs: 180,
      },
    },
    ...overrides,
  }
}

describe('formatCost', () => {
  it('formats zero values with two decimals', () => {
    expect(formatCost(0)).toBe('$0.00')
  })

  it('formats sub-dollar values with four decimals', () => {
    expect(formatCost(0.125)).toBe('$0.1250')
  })

  it('formats dollar values with two decimals', () => {
    expect(formatCost(12.5)).toBe('$12.50')
  })
})

describe('formatUtcOffset', () => {
  it('formats whole-hour offsets', () => {
    expect(formatUtcOffset(-180)).toBe('UTC+3')
  })

  it('formats partial-hour offsets', () => {
    expect(formatUtcOffset(330)).toBe('UTC-5:30')
  })
})

describe('buildDateInterpretationParams', () => {
  it('returns utc mode when UTC is selected', () => {
    expect(buildDateInterpretationParams('utc', true)).toEqual({ mode: 'utc' })
  })

  it('returns specific mode for local time', () => {
    expect(buildDateInterpretationParams('local', true)).toEqual({
      mode: 'specific',
      utcOffset: formatUtcOffset(new Date().getTimezoneOffset()),
    })
  })

  it('omits params when compatibility mode disables them', () => {
    expect(buildDateInterpretationParams('local', false)).toBeUndefined()
  })
})

describe('isLegacyDateInterpretationUnsupportedError', () => {
  it('detects unsupported mode/utcOffset errors', () => {
    expect(
      isLegacyDateInterpretationUnsupportedError(
        new Error("invalid sessions.usage params: at root: unexpected property 'mode'"),
      ),
    ).toBe(true)
  })

  it('ignores unrelated errors', () => {
    expect(isLegacyDateInterpretationUnsupportedError(new Error('gateway timeout'))).toBe(false)
  })
})

describe('filterSessionsByPeriod', () => {
  const now = 10 * 86_400_000

  it('keeps only sessions active in the selected period', () => {
    const recent = makeSession({ usage: { ...makeSession().usage!, lastActivity: now - 30 * 60_000 } })
    const stale = makeSession({
      key: 'agent:beta:main',
      usage: { ...makeSession().usage!, lastActivity: now - 2 * 86_400_000 },
    })
    expect(filterSessionsByPeriod([recent, stale], '1h', now)).toEqual([recent])
    expect(filterSessionsByPeriod([recent, stale], '24h', now)).toEqual([recent])
  })

  it('returns all sessions for all-time', () => {
    const sessions = [makeSession(), makeSession({ key: 'agent:beta:main' })]
    expect(filterSessionsByPeriod(sessions, 'all', now)).toEqual(sessions)
  })
})

describe('buildModelRows', () => {
  it('merges totals for matching provider/model pairs', () => {
    const alpha = makeSession()
    const beta = makeSession({
      key: 'agent:beta:main',
      agentId: 'beta',
      usage: {
        ...makeSession().usage!,
        totalCost: 1.25,
        totalTokens: 30,
        input: 20,
        output: 8,
        cacheRead: 1,
        cacheWrite: 1,
        modelUsage: [
          {
            provider: 'openai',
            model: 'gpt-4o',
            count: 2,
            totals: {
              input: 20,
              output: 8,
              cacheRead: 1,
              cacheWrite: 1,
              totalTokens: 30,
              totalCost: 1.25,
              inputCost: 0.5,
              outputCost: 0.65,
              cacheReadCost: 0.05,
              cacheWriteCost: 0.05,
              missingCostEntries: 0,
            },
          },
        ],
      },
    })

    expect(buildModelRows([alpha, beta])).toEqual([
      {
        key: 'openai::gpt-4o',
        provider: 'openai',
        model: 'gpt-4o',
        count: 3,
        totals: {
          input: 30,
          output: 13,
          cacheRead: 3,
          cacheWrite: 2,
          totalTokens: 48,
          totalCost: 2,
          inputCost: 0.8,
          outputCost: 1,
          cacheReadCost: 0.1,
          cacheWriteCost: 0.1,
          missingCostEntries: 0,
        },
      },
    ])
  })
})

describe('buildAgentRows', () => {
  it('aggregates totals, model labels, and activity by agent', () => {
    const rows = buildAgentRows([
      makeSession(),
      makeSession({
        key: 'agent:alpha:session-2',
        usage: { ...makeSession().usage!, lastActivity: 2_000, totalCost: 1.1, totalTokens: 20 },
      }),
      makeSession({
        key: 'agent:beta:main',
        agentId: 'beta',
        usage: {
          ...makeSession().usage!,
          input: 2,
          output: 2,
          cacheRead: 1,
          cacheWrite: 0,
          lastActivity: 3_000,
          totalCost: 0.2,
          totalTokens: 5,
          modelUsage: [],
        },
        modelProvider: 'anthropic',
        model: 'claude-sonnet',
      }),
    ])

    expect(rows).toEqual([
      {
        agentId: 'alpha',
        sessions: 2,
        models: ['openai/gpt-4o'],
        lastActive: 2_000,
        totals: {
          input: 20,
          output: 10,
          cacheRead: 4,
          cacheWrite: 2,
          totalTokens: 38,
          totalCost: 1.85,
          inputCost: 0.6,
          outputCost: 0.7,
          cacheReadCost: 0.1,
          cacheWriteCost: 0.1,
          missingCostEntries: 0,
        },
      },
      {
        agentId: 'beta',
        sessions: 1,
        models: ['anthropic/claude-sonnet'],
        lastActive: 3_000,
        totals: {
          input: 2,
          output: 2,
          cacheRead: 1,
          cacheWrite: 0,
          totalTokens: 5,
          totalCost: 0.2,
          inputCost: 0.3,
          outputCost: 0.35,
          cacheReadCost: 0.05,
          cacheWriteCost: 0.05,
          missingCostEntries: 0,
        },
      },
    ])
  })
})

describe('buildUsageOverviewStats', () => {
  it('computes totals, unique agents, and weighted latency', () => {
    const alpha = makeSession()
    const beta = makeSession({
      key: 'agent:beta:main',
      agentId: 'beta',
      usage: {
        ...makeSession().usage!,
        totalCost: 0.5,
        totalTokens: 10,
        latency: { count: 1, avgMs: 300, p95Ms: 300, minMs: 300, maxMs: 300 },
      },
    })

    expect(buildUsageOverviewStats([alpha, beta])).toEqual({
      messages: 0,
      userMessages: 0,
      assistantMessages: 0,
      toolCalls: 0,
      toolResults: 0,
      errors: 0,
      uniqueTools: 0,
      sessionCount: 2,
      activeAgents: 2,
      avgLatencyMs: 200,
      avgDurationMs: null,
      avgTokensPerMessage: null,
      avgCostPerMessage: null,
      throughputTokensPerMinute: null,
      errorRate: null,
      cacheHitRate: 4 / 24,
      promptTokens: 24,
      totals: {
        input: 20,
        output: 10,
        cacheRead: 4,
        cacheWrite: 2,
        totalTokens: 28,
        totalCost: 1.25,
        inputCost: 0.6,
        outputCost: 0.7,
        cacheReadCost: 0.1,
        cacheWriteCost: 0.1,
        missingCostEntries: 0,
      },
    })
  })
})

describe('usage date presets', () => {
  const now = Date.UTC(2026, 2, 7, 12, 0, 0)

  it('builds today and rolling ranges', () => {
    expect(getUsagePresetRange('today', now)).toEqual({
      startDate: '2026-03-07',
      endDate: '2026-03-07',
    })
    expect(getUsagePresetRange('7d', now)).toEqual({
      startDate: '2026-03-01',
      endDate: '2026-03-07',
    })
    expect(getUsagePresetRange('30d', now)).toEqual({
      startDate: '2026-02-06',
      endDate: '2026-03-07',
    })
  })

  it('detects active preset from the selected range', () => {
    expect(getUsageRangePreset('2026-03-01', '2026-03-07', now)).toBe('7d')
    expect(getUsageRangePreset('2026-03-07', '2026-03-07', now)).toBe('today')
    expect(getUsageRangePreset('2026-03-02', '2026-03-07', now)).toBeNull()
  })
})

describe('resolveContextPercent', () => {
  it('returns null without a context limit', () => {
    expect(resolveContextPercent(1200, null)).toBeNull()
  })

  it('computes the usage percentage from total tokens and limit', () => {
    expect(resolveContextPercent(1200, 4000)).toBe(30)
  })
})
