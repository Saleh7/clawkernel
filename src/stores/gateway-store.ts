// ---------------------------------------------------------------------------
//  Gateway Store — Zustand store for the persistent WS connection
//
//  Ported from Axolotl/apps/webclaw/src/stores/gateway-store.ts
//  with adaptations for ClawKernel's domain needs.
// ---------------------------------------------------------------------------

import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { GatewayClient } from '@/lib/gateway/client'
import type {
  AgentsListResult,
  ChannelsStatusSnapshot,
  ConfigSnapshot,
  ConnectionState,
  CronJob,
  CronStatus,
  GatewayClientOptions,
  GatewayEventFrame,
  GatewayHelloOk,
  GatewaySessionRow,
  GatewaySnapshot,
  HealthSnapshot,
  PresenceEntry,
  SessionsListResult,
  SkillStatusReport,
} from '@/lib/gateway/types'
import { createLogger } from '@/lib/logger'

const log = createLogger('gateway:store')

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

function resolveModelLabel(provider: unknown, model: unknown): string | null {
  const p = typeof provider === 'string' ? provider.trim() : ''
  const m = typeof model === 'string' ? model.trim() : ''
  if (!m) return null
  return p ? `${p}/${m}` : m
}

// ---------------------------------------------------------------------------
//  Store shape
// ---------------------------------------------------------------------------

type GatewayStore = {
  // -- Connection -----------------------------------------------------------
  client: GatewayClient | null
  state: ConnectionState
  error: string | null
  scopeError: string | null

  // -- Snapshot data (populated on hello-ok + live events) ------------------
  agents: AgentsListResult | null
  sessions: Array<GatewaySessionRow>
  sessionsDefaults: { model: string | null; contextTokens: number | null } | null
  channels: ChannelsStatusSnapshot | null
  health: HealthSnapshot | null
  config: ConfigSnapshot | null
  skills: SkillStatusReport | null
  cronStatus: CronStatus | null
  cronJobs: Array<CronJob>
  presence: Record<string, PresenceEntry>

  // -- Event log (for Events page) ------------------------------------------
  eventLog: Array<{ ts: number; event: string; payload?: unknown }>
  eventLogEnabled: boolean
  setEventLogEnabled: (enabled: boolean) => void

  // -- Active agent runs (from chat events) ---------------------------------
  activeRuns: Record<string, { sessionKey: string; startedAt: number }>
  /** Incremented when a chat run completes — signals sessions page to refresh. */
  sessionRefreshHint: number

  // -- Compaction & fallback indicators (from agent events) -----------------
  compactionStatus: { sessionKey: string; active: boolean; startedAt: number; completedAt: number | null } | null
  fallbackStatus: {
    sessionKey: string
    phase: 'active' | 'cleared'
    selected: string
    active: string
    previous?: string
    reason?: string
    attempts: string[]
    occurredAt: number
  } | null

  // -- Actions --------------------------------------------------------------
  connect: (options: GatewayClientOptions) => void
  disconnect: () => void

  // -- Data refresh actions (used by pages after API calls) -----------------
  setConfig: (config: ConfigSnapshot) => void
  setAgents: (agents: AgentsListResult) => void
  setSessions: (
    sessions: GatewaySessionRow[],
    defaults?: { model: string | null; contextTokens: number | null } | null,
  ) => void
  setCronData: (jobs: CronJob[], status: CronStatus | null) => void
  clearEventLog: () => void

  // -- Internal (called from event handlers) --------------------------------
  _applySnapshot: (snapshot: GatewaySnapshot) => void
  _handleEvent: (frame: GatewayEventFrame) => void
}

// ---------------------------------------------------------------------------
//  Store creation
// ---------------------------------------------------------------------------

export const useGatewayStore = create<GatewayStore>()(
  subscribeWithSelector((set, get) => ({
    // -- Initial state ------------------------------------------------------
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
    setEventLogEnabled: (enabled: boolean) => set({ eventLogEnabled: enabled }),
    activeRuns: {},
    sessionRefreshHint: 0,
    compactionStatus: null,
    fallbackStatus: null,

    // -- Connect ------------------------------------------------------------
    connect(options: GatewayClientOptions) {
      const existing = get().client
      if (existing) {
        existing.stop()
      }

      const client = new GatewayClient(options)

      client.on('stateChange', (state) => {
        set({ state })
      })

      client.on('ready', (hello: GatewayHelloOk) => {
        set({ error: null, scopeError: null })
        if (hello.snapshot) {
          get()._applySnapshot(hello.snapshot)
        }
        // Fetch eagerly — snapshot may not include everything
        void Promise.all([
          client.request<AgentsListResult>('agents.list', {}).then((r) => {
            set({ agents: r })
          }),
          client
            .request<SessionsListResult>('sessions.list', {
              includeGlobal: false,
              includeUnknown: false,
            })
            .then((r) => {
              set({ sessions: r.sessions, sessionsDefaults: r.defaults })
            }),
          client.request<ChannelsStatusSnapshot>('channels.status', {}).then((r) => {
            set({ channels: r })
          }),
        ]).catch((err) => {
          // Check for scope/permission errors
          const msg = err instanceof Error ? err.message : String(err)
          if (
            msg.includes('scope') ||
            msg.includes('permission') ||
            msg.includes('forbidden') ||
            msg.includes('unauthorized')
          ) {
            set({ scopeError: 'Insufficient permissions — check gateway auth configuration' })
          }
        })
      })

      client.on('event', (frame) => {
        get()._handleEvent(frame)
      })

      client.on('close', (info: { code: number; reason: string }) => {
        if (info.code === 1012) {
          set({ error: 'Gateway restarting, reconnecting…' })
        }
      })

      client.on('error', (err) => {
        set({ error: err.message })
      })

      client.on('gap', (info) => {
        log.warn(`Sequence gap: expected ${info.expected}, got ${info.received}. Refreshing sessions.`)
        client
          .request<SessionsListResult>('sessions.list', {
            includeGlobal: false,
            includeUnknown: false,
          })
          .then((result) => {
            set({ sessions: result.sessions, sessionsDefaults: result.defaults })
          })
          .catch((err: unknown) => {
            log.warn('Gap recovery failed — sessions may be stale', err)
          })
      })

      set({ client, state: 'connecting', error: null })
      client.start()
    },

    // -- Disconnect ---------------------------------------------------------
    disconnect() {
      const { client } = get()
      if (client) {
        client.stop()
      }
      set({
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
        activeRuns: {},
        sessionRefreshHint: 0,
        compactionStatus: null,
        fallbackStatus: null,
      })
    },

    // -- Data refresh actions ------------------------------------------------
    setConfig: (config) => set({ config }),
    setAgents: (agents) => set({ agents }),
    setSessions: (sessions, defaults) =>
      set({ sessions, ...(defaults !== undefined ? { sessionsDefaults: defaults } : {}) }),
    setCronData: (jobs, status) => set({ cronJobs: jobs, cronStatus: status }),
    clearEventLog: () => set({ eventLog: [] }),

    // -- Apply snapshot from hello-ok ---------------------------------------
    _applySnapshot(snapshot: GatewaySnapshot) {
      set({
        ...(snapshot.agents ? { agents: snapshot.agents } : {}),
        ...(snapshot.sessions
          ? { sessions: snapshot.sessions.sessions, sessionsDefaults: snapshot.sessions.defaults }
          : {}),
        ...(snapshot.channels ? { channels: snapshot.channels } : {}),
        ...(snapshot.health ? { health: snapshot.health } : {}),
        ...(snapshot.config ? { config: snapshot.config } : {}),
        ...(snapshot.skills ? { skills: snapshot.skills } : {}),
        ...(snapshot.cron?.status ? { cronStatus: snapshot.cron.status } : {}),
        ...(snapshot.cron?.jobs ? { cronJobs: snapshot.cron.jobs } : {}),
        ...(snapshot.presence ? { presence: snapshot.presence } : {}),
      })
    },

    // -- Route live events --------------------------------------------------
    _handleEvent(frame: GatewayEventFrame) {
      const { event, payload } = frame

      // Append to event log only when Events page is active
      if (get().eventLogEnabled) {
        set((s) => ({
          eventLog: [{ ts: Date.now(), event, payload }, ...s.eventLog].slice(0, 250),
        }))
      }

      switch (event) {
        case 'sessions': {
          if (!payload) break
          const sessionData = payload as SessionsListResult
          set({ sessions: sessionData.sessions, sessionsDefaults: sessionData.defaults })
          break
        }
        case 'health': {
          if (payload) set({ health: payload as HealthSnapshot })
          break
        }
        case 'presence': {
          if (payload) {
            set({ presence: { ...get().presence, ...(payload as Record<string, PresenceEntry>) } })
          }
          break
        }
        case 'config': {
          if (payload) set({ config: payload as ConfigSnapshot })
          break
        }
        case 'channels': {
          if (payload) set({ channels: payload as ChannelsStatusSnapshot })
          break
        }
        case 'skills': {
          if (payload) set({ skills: payload as SkillStatusReport })
          break
        }
        case 'cron.status': {
          if (payload) set({ cronStatus: payload as CronStatus })
          break
        }
        case 'cron.jobs': {
          if (!payload) break
          const cronData = payload as { jobs: Array<CronJob> }
          set({ cronJobs: cronData.jobs })
          break
        }
        case 'agent': {
          if (!payload) break
          const p = payload as {
            runId?: string
            sessionKey?: string
            stream?: string
            data?: Record<string, unknown>
          }
          const runId = p.runId
          const sessionKey = p.sessionKey

          if (runId && sessionKey && p.stream === 'tool') {
            if (!get().activeRuns[runId]) {
              set((s) => ({
                activeRuns: { ...s.activeRuns, [runId]: { sessionKey, startedAt: Date.now() } },
              }))
            }
          }

          if (p.stream === 'compaction' && sessionKey) {
            const phase = p.data?.phase as string | undefined
            if (phase === 'start') {
              set({ compactionStatus: { sessionKey, active: true, startedAt: Date.now(), completedAt: null } })
            } else if (phase === 'end') {
              set((s) => ({
                compactionStatus: {
                  sessionKey,
                  active: false,
                  startedAt: s.compactionStatus?.startedAt ?? Date.now(),
                  completedAt: Date.now(),
                },
              }))
              setTimeout(() => {
                const current = get().compactionStatus
                if (current && !current.active && current.sessionKey === sessionKey) {
                  set({ compactionStatus: null })
                }
              }, 5000)
            }
          }

          if ((p.stream === 'lifecycle' || p.stream === 'fallback') && sessionKey) {
            const data = p.data ?? {}
            const phase = p.stream === 'fallback' ? 'fallback' : (data.phase as string | undefined)
            if (phase !== 'fallback' && phase !== 'fallback_cleared') break

            const selected =
              resolveModelLabel(data.selectedProvider, data.selectedModel) ??
              resolveModelLabel(data.fromProvider, data.fromModel)
            const active =
              resolveModelLabel(data.activeProvider, data.activeModel) ??
              resolveModelLabel(data.toProvider, data.toModel)
            if (!selected || !active) break

            const previous = resolveModelLabel(data.previousActiveProvider, data.previousActiveModel)
            const reason =
              typeof data.reasonSummary === 'string'
                ? data.reasonSummary
                : typeof data.reason === 'string'
                  ? data.reason
                  : undefined
            const attempts = Array.isArray(data.attemptSummaries)
              ? (data.attemptSummaries as string[]).filter((s) => typeof s === 'string')
              : []

            set({
              fallbackStatus: {
                sessionKey,
                phase: phase === 'fallback_cleared' ? 'cleared' : 'active',
                selected,
                active: phase === 'fallback_cleared' ? selected : active,
                previous: phase === 'fallback_cleared' ? (previous ?? undefined) : undefined,
                reason: reason ?? undefined,
                attempts,
                occurredAt: Date.now(),
              },
            })
            setTimeout(() => {
              const current = get().fallbackStatus
              if (current && current.sessionKey === sessionKey) {
                set({ fallbackStatus: null })
              }
            }, 8000)
          }

          break
        }
        case 'chat': {
          if (payload) {
            const chatPayload = payload as { runId?: string; sessionKey?: string; state?: string }
            const runId = chatPayload.runId
            const sessionKey = chatPayload.sessionKey
            if (runId && sessionKey) {
              if (chatPayload.state === 'delta') {
                // Only add if not already tracked — avoid new object on every token
                const existing = get().activeRuns[runId]
                if (!existing || existing.sessionKey !== sessionKey) {
                  set((s) => ({
                    activeRuns: { ...s.activeRuns, [runId]: { sessionKey, startedAt: Date.now() } },
                  }))
                }
              } else if (
                chatPayload.state === 'final' ||
                chatPayload.state === 'error' ||
                chatPayload.state === 'aborted'
              ) {
                set((s) => {
                  const next = { ...s.activeRuns }
                  delete next[runId]
                  return { activeRuns: next, sessionRefreshHint: s.sessionRefreshHint + 1 }
                })
              }
            }
          }
          break
        }
        case 'tick': {
          // Prune stale activeRuns — if no event received for 30s, assume run ended
          const STALE_MS = 30_000
          const now = Date.now()
          const runs = get().activeRuns
          const staleKeys = Object.entries(runs)
            .filter(([, v]) => now - v.startedAt > STALE_MS)
            .map(([k]) => k)
          if (staleKeys.length > 0) {
            set((s) => {
              const next = { ...s.activeRuns }
              for (const k of staleKeys) delete next[k]
              return { activeRuns: next }
            })
          }
          break
        }
        default:
          if (import.meta.env.DEV) {
            log.debug(`Unhandled event: ${event}`, payload as Record<string, unknown>)
          }
      }
    },
  })),
)

// ---------------------------------------------------------------------------
//  Selectors
// ---------------------------------------------------------------------------

export const selectIsConnected = (s: GatewayStore) => s.state === 'connected'
export const selectClient = (s: GatewayStore) => s.client
export const selectAgents = (s: GatewayStore) => s.agents
export const selectSessions = (s: GatewayStore) => s.sessions
export const selectChannels = (s: GatewayStore) => s.channels
export const selectPresence = (s: GatewayStore) => s.presence
export const selectScopeError = (s: GatewayStore) => s.scopeError
export const selectActiveRuns = (s: GatewayStore) => s.activeRuns
