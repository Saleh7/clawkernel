import { describe, expect, it } from 'vitest'
import {
  buildUsageFacetOptions,
  buildUsageOverviewStats,
  filterUsageSessions,
  USAGE_FILTER_ALL,
} from '@/app/usage/analytics'
import type { SessionUsageEntry } from '@/app/usage/types'

function makeSession(overrides: Partial<SessionUsageEntry> = {}): SessionUsageEntry {
  return {
    key: 'agent:alpha:main',
    label: 'alpha-main',
    sessionId: 'session-alpha',
    agentId: 'alpha',
    channel: 'webchat',
    modelProvider: 'openai',
    model: 'gpt-5',
    usage: {
      input: 1_000,
      output: 400,
      cacheRead: 200,
      cacheWrite: 0,
      totalTokens: 1_600,
      totalCost: 0.8,
      inputCost: 0.3,
      outputCost: 0.45,
      cacheReadCost: 0.05,
      cacheWriteCost: 0,
      missingCostEntries: 0,
      lastActivity: Date.UTC(2026, 2, 7, 12, 0, 0),
      durationMs: 240_000,
      messageCounts: {
        total: 8,
        user: 3,
        assistant: 3,
        toolCalls: 1,
        toolResults: 1,
        errors: 1,
      },
      toolUsage: {
        totalCalls: 1,
        uniqueTools: 1,
        tools: [{ name: 'exec', count: 1 }],
      },
      modelUsage: [
        {
          provider: 'openai',
          model: 'gpt-5',
          count: 8,
          totals: {
            input: 1_000,
            output: 400,
            cacheRead: 200,
            cacheWrite: 0,
            totalTokens: 1_600,
            totalCost: 0.8,
            inputCost: 0.3,
            outputCost: 0.45,
            cacheReadCost: 0.05,
            cacheWriteCost: 0,
            missingCostEntries: 0,
          },
        },
      ],
    },
    ...overrides,
  }
}

describe('buildUsageFacetOptions', () => {
  it('collects sorted facet options from sessions', () => {
    const beta = makeSession({
      key: 'agent:beta:main',
      agentId: 'beta',
      channel: 'discord',
      modelProvider: 'anthropic',
      model: 'claude-sonnet',
      usage: {
        ...makeSession().usage!,
        totalTokens: 3_000,
        modelUsage: [
          {
            provider: 'anthropic',
            model: 'claude-sonnet',
            count: 4,
            totals: {
              input: 1_800,
              output: 900,
              cacheRead: 300,
              cacheWrite: 0,
              totalTokens: 3_000,
              totalCost: 1.2,
              inputCost: 0.5,
              outputCost: 0.6,
              cacheReadCost: 0.1,
              cacheWriteCost: 0,
              missingCostEntries: 0,
            },
          },
        ],
        toolUsage: {
          totalCalls: 3,
          uniqueTools: 2,
          tools: [
            { name: 'exec', count: 2 },
            { name: 'read', count: 1 },
          ],
        },
      },
    })

    const options = buildUsageFacetOptions(
      [makeSession(), beta],
      new Map([
        ['alpha', 'Alpha Agent'],
        ['beta', 'Beta Agent'],
      ]),
    )

    expect(options.agents[0]).toEqual({ value: 'beta', label: 'Beta Agent' })
    expect(options.channels.map((option) => option.value)).toEqual(['discord', 'webchat'])
    expect(options.providers.map((option) => option.value)).toEqual(['anthropic', 'openai'])
    expect(options.models.map((option) => option.value)).toEqual(['claude-sonnet', 'gpt-5'])
    expect(options.tools.map((option) => option.value)).toEqual(['exec', 'read'])
  })
})

describe('filterUsageSessions', () => {
  it('applies query and facet filters together', () => {
    const alpha = makeSession()
    const beta = makeSession({
      key: 'agent:beta:main',
      label: 'beta-main',
      sessionId: 'session-beta',
      agentId: 'beta',
      channel: 'discord',
      modelProvider: 'anthropic',
      model: 'claude-sonnet',
      usage: {
        ...makeSession().usage!,
        modelUsage: [
          {
            provider: 'anthropic',
            model: 'claude-sonnet',
            count: 5,
            totals: {
              input: 1_000,
              output: 400,
              cacheRead: 200,
              cacheWrite: 0,
              totalTokens: 1_600,
              totalCost: 0.8,
              inputCost: 0.3,
              outputCost: 0.45,
              cacheReadCost: 0.05,
              cacheWriteCost: 0,
              missingCostEntries: 0,
            },
          },
        ],
      },
    })

    const agentNameById = new Map([
      ['alpha', 'Alpha Agent'],
      ['beta', 'Beta Agent'],
    ])

    expect(
      filterUsageSessions(
        [alpha, beta],
        {
          query: 'beta',
          agentId: 'beta',
          channel: 'discord',
          provider: 'anthropic',
          model: 'claude-sonnet',
          tool: USAGE_FILTER_ALL,
        },
        agentNameById,
      ),
    ).toEqual([beta])
  })
})

describe('buildUsageOverviewStats', () => {
  it('computes summary metrics from session aggregates', () => {
    const stats = buildUsageOverviewStats([makeSession()])

    expect(stats).toMatchObject({
      messages: 8,
      userMessages: 3,
      assistantMessages: 3,
      toolCalls: 1,
      toolResults: 1,
      errors: 1,
      uniqueTools: 1,
      sessionCount: 1,
      activeAgents: 1,
      avgDurationMs: 240_000,
      avgTokensPerMessage: 200,
      avgCostPerMessage: 0.1,
      throughputTokensPerMinute: 400,
      errorRate: 0.125,
      cacheHitRate: 200 / 1_200,
      promptTokens: 1_200,
    })
  })
})
