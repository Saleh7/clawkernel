// ---------------------------------------------------------------------------
//  gateway-store — Event handlers, snapshot, timers (Phase 3)
// ---------------------------------------------------------------------------

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock GatewayClient before importing the store
vi.mock('@/lib/gateway/client', () => ({
  GatewayClient: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    request: vi.fn().mockResolvedValue({}),
  })),
}))

// Mock logger to silence output
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import type {
  ChannelsStatusSnapshot,
  ConfigSnapshot,
  CronJob,
  CronStatus,
  GatewayEventFrame,
  GatewaySessionRow,
  GatewaySnapshot,
  HealthSnapshot,
  PresenceEntry,
  SkillStatusReport,
} from '@/lib/gateway/types'

// Import store — must be after mocks
const { useGatewayStore } = await import('@/stores/gateway-store')

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

function fireEvent(event: string, payload?: unknown) {
  const frame: GatewayEventFrame = { type: 'event', event, payload }
  useGatewayStore.getState()._handleEvent(frame)
}

function getStore() {
  return useGatewayStore.getState()
}

// ---------------------------------------------------------------------------
//  Tests
// ---------------------------------------------------------------------------

describe('gateway-store', () => {
  beforeEach(() => {
    // Reset store to initial state
    useGatewayStore.setState({
      client: null,
      state: 'disconnected',
      error: null,
      scopeError: null,
      agents: null,
      sessions: [],
      sessionsDefaults: null,
      channels: null,
      health: null,
      config: null,
      skills: null,
      cronStatus: null,
      cronJobs: [],
      presence: {},
      eventLog: [],
      eventLogEnabled: false,
      activeRuns: {},
      sessionRefreshHint: 0,
      compactionStatus: null,
      fallbackStatus: null,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  // =========================================================================
  //  Event handlers — all 11 types
  // =========================================================================

  describe('sessions event', () => {
    it('updates sessions and defaults', () => {
      const sessions: GatewaySessionRow[] = [
        { key: 'agent:bot:main', kind: 'direct', updatedAt: Date.now() },
      ]
      const defaults = { model: 'anthropic/claude-sonnet-4-6', contextTokens: 200_000 }

      fireEvent('sessions', { sessions, defaults, ts: Date.now(), path: '', count: 1 })

      expect(getStore().sessions).toEqual(sessions)
      expect(getStore().sessionsDefaults).toEqual(defaults)
    })

    it('ignores null payload', () => {
      fireEvent('sessions', null)
      expect(getStore().sessions).toEqual([])
    })
  })

  describe('health event', () => {
    it('updates health snapshot', () => {
      const health: HealthSnapshot = { uptime: 1000 } as HealthSnapshot
      fireEvent('health', health)
      expect(getStore().health).toBe(health)
    })
  })

  describe('presence event', () => {
    it('merges presence entries', () => {
      useGatewayStore.setState({ presence: { alice: { status: 'online' } as PresenceEntry } })

      fireEvent('presence', { bob: { status: 'idle' } })

      const presence = getStore().presence
      expect(presence.alice).toBeDefined()
      expect(presence.bob).toBeDefined()
    })
  })

  describe('config event', () => {
    it('updates config', () => {
      const config: ConfigSnapshot = { raw: '{}' } as ConfigSnapshot
      fireEvent('config', config)
      expect(getStore().config).toBe(config)
    })
  })

  describe('channels event', () => {
    it('updates channels', () => {
      const channels: ChannelsStatusSnapshot = {} as ChannelsStatusSnapshot
      fireEvent('channels', channels)
      expect(getStore().channels).toBe(channels)
    })
  })

  describe('skills event', () => {
    it('updates skills', () => {
      const skills: SkillStatusReport = {} as SkillStatusReport
      fireEvent('skills', skills)
      expect(getStore().skills).toBe(skills)
    })
  })

  describe('cron.status event', () => {
    it('updates cron status', () => {
      const status: CronStatus = { enabled: true } as CronStatus
      fireEvent('cron.status', status)
      expect(getStore().cronStatus).toBe(status)
    })
  })

  describe('cron.jobs event', () => {
    it('updates cron jobs', () => {
      const jobs: CronJob[] = [{ id: 'j1' } as CronJob]
      fireEvent('cron.jobs', { jobs })
      expect(getStore().cronJobs).toEqual(jobs)
    })
  })

  describe('agent event', () => {
    it('tracks tool run from agent event', () => {
      fireEvent('agent', {
        runId: 'r1',
        sessionKey: 'agent:bot:main',
        stream: 'tool',
      })

      expect(getStore().activeRuns.r1).toBeDefined()
      expect(getStore().activeRuns.r1.sessionKey).toBe('agent:bot:main')
    })

    it('ignores non-tool stream for activeRuns', () => {
      fireEvent('agent', {
        runId: 'r2',
        sessionKey: 'agent:bot:main',
        stream: 'lifecycle',
      })
      expect(getStore().activeRuns.r2).toBeUndefined()
    })

    it('sets compaction status on start', () => {
      fireEvent('agent', {
        sessionKey: 'agent:bot:main',
        stream: 'compaction',
        data: { phase: 'start' },
      })
      const cs = getStore().compactionStatus
      expect(cs).not.toBeNull()
      expect(cs?.active).toBe(true)
      expect(cs?.sessionKey).toBe('agent:bot:main')
    })

    it('clears compaction status on end after delay', () => {
      vi.useFakeTimers()

      fireEvent('agent', {
        sessionKey: 'agent:bot:main',
        stream: 'compaction',
        data: { phase: 'start' },
      })

      fireEvent('agent', {
        sessionKey: 'agent:bot:main',
        stream: 'compaction',
        data: { phase: 'end' },
      })

      expect(getStore().compactionStatus?.active).toBe(false)

      vi.advanceTimersByTime(5000)
      expect(getStore().compactionStatus).toBeNull()
    })

    it('sets fallback status from lifecycle stream', () => {
      fireEvent('agent', {
        sessionKey: 'agent:bot:main',
        stream: 'lifecycle',
        data: {
          phase: 'fallback',
          selectedProvider: 'anthropic',
          selectedModel: 'claude-sonnet-4-6',
          activeProvider: 'openai',
          activeModel: 'gpt-4o',
          reasonSummary: 'Rate limited',
          attemptSummaries: ['attempt 1'],
        },
      })

      const fs = getStore().fallbackStatus
      expect(fs).not.toBeNull()
      expect(fs?.phase).toBe('active')
      expect(fs?.selected).toBe('anthropic/claude-sonnet-4-6')
      expect(fs?.active).toBe('openai/gpt-4o')
      expect(fs?.reason).toBe('Rate limited')
      expect(fs?.attempts).toEqual(['attempt 1'])
    })

    it('clears fallback status after delay', () => {
      vi.useFakeTimers()

      fireEvent('agent', {
        sessionKey: 'agent:bot:main',
        stream: 'fallback',
        data: {
          selectedProvider: 'a',
          selectedModel: 'b',
          activeProvider: 'c',
          activeModel: 'd',
        },
      })

      expect(getStore().fallbackStatus).not.toBeNull()

      vi.advanceTimersByTime(8000)
      expect(getStore().fallbackStatus).toBeNull()
    })

    it('handles fallback_cleared phase', () => {
      fireEvent('agent', {
        sessionKey: 'agent:bot:main',
        stream: 'lifecycle',
        data: {
          phase: 'fallback_cleared',
          selectedProvider: 'anthropic',
          selectedModel: 'claude-sonnet-4-6',
          activeProvider: 'openai',
          activeModel: 'gpt-4o',
        },
      })

      const fs = getStore().fallbackStatus
      expect(fs?.phase).toBe('cleared')
      // When cleared, active should be the selected model
      expect(fs?.active).toBe('anthropic/claude-sonnet-4-6')
    })
  })

  describe('chat event', () => {
    it('tracks delta run in activeRuns', () => {
      fireEvent('chat', {
        runId: 'cr1',
        sessionKey: 'agent:bot:main',
        state: 'delta',
      })

      expect(getStore().activeRuns.cr1).toBeDefined()
    })

    it('removes run and increments sessionRefreshHint on final', () => {
      useGatewayStore.setState({
        activeRuns: { cr1: { sessionKey: 'agent:bot:main', startedAt: Date.now() } },
        sessionRefreshHint: 0,
      })

      fireEvent('chat', { runId: 'cr1', sessionKey: 'agent:bot:main', state: 'final' })

      expect(getStore().activeRuns.cr1).toBeUndefined()
      expect(getStore().sessionRefreshHint).toBe(1)
    })

    it('handles error state same as final', () => {
      useGatewayStore.setState({
        activeRuns: { cr2: { sessionKey: 'agent:bot:main', startedAt: Date.now() } },
      })

      fireEvent('chat', { runId: 'cr2', sessionKey: 'agent:bot:main', state: 'error' })
      expect(getStore().activeRuns.cr2).toBeUndefined()
    })

    it('handles aborted state same as final', () => {
      useGatewayStore.setState({
        activeRuns: { cr3: { sessionKey: 'agent:bot:main', startedAt: Date.now() } },
      })

      fireEvent('chat', { runId: 'cr3', sessionKey: 'agent:bot:main', state: 'aborted' })
      expect(getStore().activeRuns.cr3).toBeUndefined()
    })

    it('ignores events without runId', () => {
      fireEvent('chat', { sessionKey: 'agent:bot:main', state: 'delta' })
      expect(Object.keys(getStore().activeRuns)).toHaveLength(0)
    })
  })

  describe('tick event', () => {
    it('evicts stale runs older than 120s', () => {
      const now = Date.now()
      useGatewayStore.setState({
        activeRuns: {
          fresh: { sessionKey: 'a', startedAt: now - 10_000 },
          stale: { sessionKey: 'b', startedAt: now - 130_000 },
        },
      })

      fireEvent('tick', {})

      expect(getStore().activeRuns.fresh).toBeDefined()
      expect(getStore().activeRuns.stale).toBeUndefined()
    })

    it('does nothing when no stale runs', () => {
      const now = Date.now()
      useGatewayStore.setState({
        activeRuns: { r1: { sessionKey: 'a', startedAt: now } },
      })

      fireEvent('tick', {})
      expect(getStore().activeRuns.r1).toBeDefined()
    })
  })

  // =========================================================================
  //  Event log
  // =========================================================================

  describe('event log', () => {
    it('records events when enabled', () => {
      useGatewayStore.setState({ eventLogEnabled: true })
      fireEvent('health', { uptime: 1 })
      expect(getStore().eventLog).toHaveLength(1)
      expect(getStore().eventLog[0].event).toBe('health')
    })

    it('does not record events when disabled', () => {
      useGatewayStore.setState({ eventLogEnabled: false })
      fireEvent('health', { uptime: 1 })
      expect(getStore().eventLog).toHaveLength(0)
    })

    it('limits log to 250 entries', () => {
      useGatewayStore.setState({ eventLogEnabled: true })
      for (let i = 0; i < 260; i++) {
        fireEvent('tick', { i })
      }
      expect(getStore().eventLog.length).toBeLessThanOrEqual(250)
    })
  })

  // =========================================================================
  //  _applySnapshot
  // =========================================================================

  describe('_applySnapshot', () => {
    it('applies full snapshot', () => {
      const snapshot: GatewaySnapshot = {
        agents: { defaultId: 'bot', mainKey: 'agent:bot:main', scope: 'all', agents: [] },
        sessions: {
          ts: Date.now(),
          path: '',
          count: 0,
          defaults: { model: null, contextTokens: null },
          sessions: [{ key: 'agent:bot:main', kind: 'direct', updatedAt: Date.now() }],
        },
        channels: {} as ChannelsStatusSnapshot,
        health: { uptime: 500 } as HealthSnapshot,
        config: { raw: '{}' } as ConfigSnapshot,
        skills: {} as SkillStatusReport,
        cron: {
          status: { enabled: true } as CronStatus,
          jobs: [{ id: 'j1' } as CronJob],
        },
        presence: { alice: { status: 'online' } as PresenceEntry },
      }

      getStore()._applySnapshot(snapshot)

      expect(getStore().agents).toBe(snapshot.agents)
      expect(getStore().sessions).toHaveLength(1)
      expect(getStore().health).toBe(snapshot.health)
      expect(getStore().config).toBe(snapshot.config)
      expect(getStore().skills).toBe(snapshot.skills)
      expect(getStore().cronStatus).toEqual({ enabled: true })
      expect(getStore().cronJobs).toHaveLength(1)
      expect(getStore().presence.alice).toBeDefined()
    })

    it('applies partial snapshot without overwriting unset fields', () => {
      useGatewayStore.setState({
        health: { uptime: 100 } as HealthSnapshot,
        config: { raw: '{"a":1}' } as ConfigSnapshot,
      })

      getStore()._applySnapshot({ health: { uptime: 200 } as HealthSnapshot })

      expect(getStore().health?.uptime).toBe(200)
      // Config should remain unchanged
      expect((getStore().config as ConfigSnapshot)?.raw).toBe('{"a":1}')
    })
  })

  // =========================================================================
  //  Timer cleanup on disconnect
  // =========================================================================

  describe('disconnect', () => {
    it('clears status timers on disconnect', () => {
      vi.useFakeTimers()

      // Trigger a compaction with pending clear timer
      fireEvent('agent', {
        sessionKey: 'agent:bot:main',
        stream: 'compaction',
        data: { phase: 'start' },
      })
      fireEvent('agent', {
        sessionKey: 'agent:bot:main',
        stream: 'compaction',
        data: { phase: 'end' },
      })

      // Disconnect before timer fires
      getStore().disconnect()

      // Advance past clear delay — should not throw or set state
      vi.advanceTimersByTime(10_000)

      expect(getStore().compactionStatus).toBeNull()
      expect(getStore().fallbackStatus).toBeNull()
    })

    it('resets all store state on disconnect', () => {
      useGatewayStore.setState({
        sessions: [{ key: 'a', kind: 'direct', updatedAt: Date.now() }],
        activeRuns: { r1: { sessionKey: 'a', startedAt: Date.now() } },
        sessionRefreshHint: 5,
      })

      getStore().disconnect()

      expect(getStore().sessions).toEqual([])
      expect(getStore().activeRuns).toEqual({})
      expect(getStore().sessionRefreshHint).toBe(0)
      expect(getStore().state).toBe('disconnected')
    })
  })

  // =========================================================================
  //  Data refresh actions
  // =========================================================================

  describe('data refresh actions', () => {
    it('setConfig updates config', () => {
      const config = { raw: '{"x":1}' } as ConfigSnapshot
      getStore().setConfig(config)
      expect(getStore().config).toBe(config)
    })

    it('setSessions updates sessions and optionally defaults', () => {
      const sessions = [{ key: 'a', kind: 'direct' as const, updatedAt: Date.now() }]
      const defaults = { model: 'test', contextTokens: 100 }

      getStore().setSessions(sessions, defaults)
      expect(getStore().sessions).toBe(sessions)
      expect(getStore().sessionsDefaults).toBe(defaults)
    })

    it('setSessions without defaults preserves existing', () => {
      const existing = { model: 'keep', contextTokens: 50 }
      useGatewayStore.setState({ sessionsDefaults: existing })

      getStore().setSessions([])
      expect(getStore().sessionsDefaults).toBe(existing)
    })

    it('setCronData updates jobs and status', () => {
      const jobs = [{ id: 'j1' } as CronJob]
      const status = { enabled: false } as CronStatus

      getStore().setCronData(jobs, status)
      expect(getStore().cronJobs).toBe(jobs)
      expect(getStore().cronStatus).toBe(status)
    })

    it('clearEventLog empties the log', () => {
      useGatewayStore.setState({ eventLog: [{ ts: 1, event: 'test' }] })
      getStore().clearEventLog()
      expect(getStore().eventLog).toEqual([])
    })
  })
})
