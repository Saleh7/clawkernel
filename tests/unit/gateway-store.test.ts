import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/gateway/client', () => ({
  GatewayClient: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    request: vi.fn().mockResolvedValue({}),
  })),
}))
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import type {
  ConfigSnapshot,
  CronJob,
  CronStatus,
  GatewayEventFrame,
  GatewaySnapshot,
  HealthSnapshot,
  PresenceEntry,
} from '@/lib/gateway/types'

// Import store — must be after mocks
const { useGatewayStore } = await import('@/stores/gateway-store')

function fireEvent(event: string, payload?: unknown) {
  const frame: GatewayEventFrame = { type: 'event', event, payload }
  useGatewayStore.getState()._handleEvent(frame)
}

function getStore() {
  return useGatewayStore.getState()
}

describe('gateway-store', () => {
  beforeEach(() => {
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
      gatewayShutdown: null,
      gatewayUpdateAvailable: null,
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

  // NOTE: sessions, config, channels, skills events are NOT broadcast by upstream.
  // CK fetches these via RPC (agents.list, sessions.list, channels.status) on connect.
  // Verified: grep "broadcast.*sessions\|broadcast.*config\|broadcast.*channels\|broadcast.*skills"
  // across OpenClaw src/gateway/ returns zero results.

  describe('unhandled upstream events', () => {
    it('does not crash on unknown events', () => {
      fireEvent('sessions', { sessions: [], defaults: null })
      fireEvent('config', { raw: '{}' })
      fireEvent('channels', {})
      fireEvent('skills', {})
      // None of these should update store — they go to the DEV debug log
      expect(getStore().sessions).toEqual([])
      expect(getStore().config).toBeNull()
      expect(getStore().channels).toBeNull()
      expect(getStore().skills).toBeNull()
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
      useGatewayStore.setState({
        presence: { alice: { instanceId: 'alice', host: 'host-a', ts: 1 } as PresenceEntry },
      })

      // Upstream broadcasts { presence: Array<PresenceEntry> }
      // Source: OpenClaw src/gateway/server/presence-events.ts:11
      fireEvent('presence', {
        presence: [{ instanceId: 'bob', host: 'host-b', ts: 2 }],
      })

      const presence = getStore().presence
      expect(presence.alice).toBeDefined()
      expect(presence.bob).toBeDefined()
      expect(presence.bob.host).toBe('host-b')
    })
  })

  describe('cron event', () => {
    it('re-fetches cron data via RPC on cron broadcast', async () => {
      // Upstream broadcasts a single "cron" event (not cron.status / cron.jobs)
      // Source: OpenClaw src/gateway/server-cron.ts:359
      const status: CronStatus = { enabled: true } as CronStatus
      const jobs: CronJob[] = [{ id: 'j1' } as CronJob]
      const mockRequest = vi.fn()
        .mockResolvedValueOnce(status) // cron.status
        .mockResolvedValueOnce({ jobs }) // cron.list
      const mockClient = { connected: true, request: mockRequest }
      useGatewayStore.setState({ client: mockClient as never })

      fireEvent('cron', { jobId: 'j1', action: 'finished' })
      await vi.waitFor(() => {
        expect(mockRequest).toHaveBeenCalledWith('cron.status', {})
        expect(mockRequest).toHaveBeenCalledWith('cron.list', { includeDisabled: true })
      })
      expect(getStore().cronStatus).toBe(status)
      expect(getStore().cronJobs).toEqual(jobs)
    })

    it('does nothing when client is not connected', () => {
      useGatewayStore.setState({ client: null })
      fireEvent('cron', { jobId: 'j1', action: 'started' })
      expect(getStore().cronStatus).toBeNull()
      expect(getStore().cronJobs).toEqual([])
    })
  })

  describe('shutdown event', () => {
    it('stores shutdown info', () => {
      // Source: OpenClaw src/gateway/server-close.ts:84
      fireEvent('shutdown', { reason: 'update', restartExpectedMs: 5000 })
      const sd = getStore().gatewayShutdown
      expect(sd).not.toBeNull()
      expect(sd?.reason).toBe('update')
      expect(sd?.restartExpectedMs).toBe(5000)
    })

    it('ignores null payload', () => {
      fireEvent('shutdown', null)
      expect(getStore().gatewayShutdown).toBeNull()
    })
  })

  describe('update.available event', () => {
    it('stores update info', () => {
      // Source: OpenClaw src/gateway/server.impl.ts:911
      fireEvent('update.available', {
        updateAvailable: { currentVersion: '2026.3.0', latestVersion: '2026.3.11', channel: 'stable' },
      })
      const ua = getStore().gatewayUpdateAvailable
      expect(ua).not.toBeNull()
      expect(ua?.currentVersion).toBe('2026.3.0')
      expect(ua?.latestVersion).toBe('2026.3.11')
    })

    it('clears update info when null', () => {
      useGatewayStore.setState({
        gatewayUpdateAvailable: { currentVersion: '1.0', latestVersion: '2.0', channel: 'stable' },
      })
      fireEvent('update.available', { updateAvailable: null })
      expect(getStore().gatewayUpdateAvailable).toBeNull()
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

  describe('_applySnapshot', () => {
    // Snapshot type now matches upstream SnapshotSchema:
    // Source: OpenClaw src/gateway/protocol/schema/snapshot.ts
    // Contains: presence (required Array), health (required), stateVersion, uptimeMs,
    // Does NOT contain: agents, sessions, channels, config, skills, cron
    // Those are fetched via RPC after connect.

    it('applies full snapshot with presence and health', () => {
      const snapshot: GatewaySnapshot = {
        presence: [{ instanceId: 'alice', host: 'host-a', ts: 1 }],
        health: { uptime: 500 } as HealthSnapshot,
        stateVersion: { presence: 1, health: 1 },
        uptimeMs: 60_000,
        updateAvailable: { currentVersion: '2026.3.0', latestVersion: '2026.3.11', channel: 'stable' },
      }

      getStore()._applySnapshot(snapshot)

      expect(getStore().health).toBe(snapshot.health)
      expect(getStore().presence.alice).toBeDefined()
      expect(getStore().presence.alice.host).toBe('host-a')
      expect(getStore().gatewayUpdateAvailable).toEqual(snapshot.updateAvailable)
    })

    it('does not overwrite config/sessions/agents (fetched via RPC)', () => {
      const existingConfig = { raw: '{"a":1}' } as ConfigSnapshot
      useGatewayStore.setState({
        config: existingConfig,
        sessions: [{ key: 'a', kind: 'direct' as const, updatedAt: Date.now() }],
      })

      getStore()._applySnapshot({
        presence: [],
        health: { uptime: 200 } as HealthSnapshot,
        stateVersion: { presence: 1, health: 1 },
        uptimeMs: 30_000,
      })

      expect(getStore().health?.uptime).toBe(200)
      // Config and sessions should remain unchanged — not in snapshot
      expect((getStore().config as ConfigSnapshot)?.raw).toBe('{"a":1}')
      expect(getStore().sessions).toHaveLength(1)
    })
  })

  describe('disconnect', () => {
    it('clears status timers on disconnect', () => {
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
        gatewayShutdown: { reason: 'test' },
        gatewayUpdateAvailable: { currentVersion: '1.0', latestVersion: '2.0', channel: 'stable' },
      })

      getStore().disconnect()

      expect(getStore().sessions).toEqual([])
      expect(getStore().activeRuns).toEqual({})
      expect(getStore().sessionRefreshHint).toBe(0)
      expect(getStore().state).toBe('disconnected')
      expect(getStore().gatewayShutdown).toBeNull()
      expect(getStore().gatewayUpdateAvailable).toBeNull()
    })
  })

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
