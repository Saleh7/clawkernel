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

function resolveModelLabel(provider: unknown, model: unknown): string | null {
  const p = typeof provider === 'string' ? provider.trim() : ''
  const m = typeof model === 'string' ? model.trim() : ''
  if (!m) return null
  return p ? `${p}/${m}` : m
}

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

type StoreSetter = (partial: Partial<GatewayStore> | ((state: GatewayStore) => Partial<GatewayStore>)) => void
type StoreGetter = () => GatewayStore
type StoreEventHandler = (payload: unknown, set: StoreSetter, get: StoreGetter) => void

type AgentEventPayload = {
  runId?: string
  sessionKey?: string
  stream?: string
  data?: Record<string, unknown>
}

type ChatRunEventPayload = {
  runId?: string
  sessionKey?: string
  state?: string
}

const EVENT_LOG_LIMIT = 250
const COMPACTION_CLEAR_DELAY_MS = 5000
const FALLBACK_CLEAR_DELAY_MS = 8000
const STALE_RUN_MAX_AGE_MS = 120_000

function appendEventLogIfEnabled(event: string, payload: unknown, set: StoreSetter, get: StoreGetter): void {
  if (!get().eventLogEnabled) return
  set((state) => ({
    eventLog: [{ ts: Date.now(), event, payload }, ...state.eventLog].slice(0, EVENT_LOG_LIMIT),
  }))
}

function handleSessionsEvent(payload: unknown, set: StoreSetter): void {
  if (!payload) return
  const sessionData = payload as SessionsListResult
  set({ sessions: sessionData.sessions, sessionsDefaults: sessionData.defaults })
}

function handleHealthEvent(payload: unknown, set: StoreSetter): void {
  if (!payload) return
  set({ health: payload as HealthSnapshot })
}

function handlePresenceEvent(payload: unknown, set: StoreSetter, get: StoreGetter): void {
  if (!payload) return
  set({ presence: { ...get().presence, ...(payload as Record<string, PresenceEntry>) } })
}

function handleConfigEvent(payload: unknown, set: StoreSetter): void {
  if (!payload) return
  set({ config: payload as ConfigSnapshot })
}

function handleChannelsEvent(payload: unknown, set: StoreSetter): void {
  if (!payload) return
  set({ channels: payload as ChannelsStatusSnapshot })
}

function handleSkillsEvent(payload: unknown, set: StoreSetter): void {
  if (!payload) return
  set({ skills: payload as SkillStatusReport })
}

function handleCronStatusEvent(payload: unknown, set: StoreSetter): void {
  if (!payload) return
  set({ cronStatus: payload as CronStatus })
}

function handleCronJobsEvent(payload: unknown, set: StoreSetter): void {
  if (!payload) return
  const cronData = payload as { jobs: Array<CronJob> }
  set({ cronJobs: cronData.jobs })
}

function parseAgentEventPayload(payload: unknown): AgentEventPayload | null {
  if (!payload || typeof payload !== 'object') return null
  return payload as AgentEventPayload
}

function trackToolRunFromAgentEvent(agentPayload: AgentEventPayload, set: StoreSetter, get: StoreGetter): void {
  if (agentPayload.stream !== 'tool') return
  if (!agentPayload.runId || !agentPayload.sessionKey) return
  if (get().activeRuns[agentPayload.runId]) return

  const runId = agentPayload.runId
  const sessionKey = agentPayload.sessionKey
  set((state) => ({
    activeRuns: { ...state.activeRuns, [runId]: { sessionKey, startedAt: Date.now() } },
  }))
}

let compactionTimerHandle: ReturnType<typeof setTimeout> | null = null
let fallbackTimerHandle: ReturnType<typeof setTimeout> | null = null

function clearStatusTimers(): void {
  if (compactionTimerHandle !== null) {
    clearTimeout(compactionTimerHandle)
    compactionTimerHandle = null
  }
  if (fallbackTimerHandle !== null) {
    clearTimeout(fallbackTimerHandle)
    fallbackTimerHandle = null
  }
}

function scheduleCompactionStatusClear(sessionKey: string, set: StoreSetter, get: StoreGetter): void {
  if (compactionTimerHandle !== null) clearTimeout(compactionTimerHandle)
  compactionTimerHandle = setTimeout(() => {
    compactionTimerHandle = null
    const current = get().compactionStatus
    if (current && !current.active && current.sessionKey === sessionKey) {
      set({ compactionStatus: null })
    }
  }, COMPACTION_CLEAR_DELAY_MS)
}

function handleCompactionStatus(agentPayload: AgentEventPayload, set: StoreSetter, get: StoreGetter): void {
  if (agentPayload.stream !== 'compaction') return
  if (!agentPayload.sessionKey) return

  const phase = agentPayload.data?.phase
  if (phase === 'start') {
    set({
      compactionStatus: {
        sessionKey: agentPayload.sessionKey,
        active: true,
        startedAt: Date.now(),
        completedAt: null,
      },
    })
    return
  }

  if (phase !== 'end') return

  const sessionKey = agentPayload.sessionKey
  set((state) => ({
    compactionStatus: {
      sessionKey,
      active: false,
      startedAt: state.compactionStatus?.startedAt ?? Date.now(),
      completedAt: Date.now(),
    },
  }))
  scheduleCompactionStatusClear(sessionKey, set, get)
}

function getFallbackPhase(
  stream: string | undefined,
  data: Record<string, unknown>,
): 'fallback' | 'fallback_cleared' | null {
  if (stream === 'fallback') return 'fallback'
  const phase = data.phase
  if (phase === 'fallback' || phase === 'fallback_cleared') return phase
  return null
}

function getFallbackReason(data: Record<string, unknown>): string | undefined {
  if (typeof data.reasonSummary === 'string') return data.reasonSummary
  if (typeof data.reason === 'string') return data.reason
  return undefined
}

function getFallbackAttempts(data: Record<string, unknown>): string[] {
  if (!Array.isArray(data.attemptSummaries)) return []
  return data.attemptSummaries.filter((attempt): attempt is string => typeof attempt === 'string')
}

function getFallbackModels(
  data: Record<string, unknown>,
): { selected: string; active: string; previous: string | null } | null {
  const selected =
    resolveModelLabel(data.selectedProvider, data.selectedModel) ?? resolveModelLabel(data.fromProvider, data.fromModel)
  const active =
    resolveModelLabel(data.activeProvider, data.activeModel) ?? resolveModelLabel(data.toProvider, data.toModel)
  if (!selected || !active) return null

  const previous = resolveModelLabel(data.previousActiveProvider, data.previousActiveModel)
  return { selected, active, previous }
}

function scheduleFallbackStatusClear(sessionKey: string, set: StoreSetter, get: StoreGetter): void {
  if (fallbackTimerHandle !== null) clearTimeout(fallbackTimerHandle)
  fallbackTimerHandle = setTimeout(() => {
    fallbackTimerHandle = null
    const current = get().fallbackStatus
    if (current?.sessionKey === sessionKey) {
      set({ fallbackStatus: null })
    }
  }, FALLBACK_CLEAR_DELAY_MS)
}

function handleFallbackStatus(agentPayload: AgentEventPayload, set: StoreSetter, get: StoreGetter): void {
  if (!agentPayload.sessionKey) return
  if (agentPayload.stream !== 'lifecycle' && agentPayload.stream !== 'fallback') return

  const data = agentPayload.data ?? {}
  const phase = getFallbackPhase(agentPayload.stream, data)
  if (!phase) return

  const models = getFallbackModels(data)
  if (!models) return

  const isCleared = phase === 'fallback_cleared'
  set({
    fallbackStatus: {
      sessionKey: agentPayload.sessionKey,
      phase: isCleared ? 'cleared' : 'active',
      selected: models.selected,
      active: isCleared ? models.selected : models.active,
      previous: isCleared ? (models.previous ?? undefined) : undefined,
      reason: getFallbackReason(data),
      attempts: getFallbackAttempts(data),
      occurredAt: Date.now(),
    },
  })

  scheduleFallbackStatusClear(agentPayload.sessionKey, set, get)
}

function handleAgentEvent(payload: unknown, set: StoreSetter, get: StoreGetter): void {
  const agentPayload = parseAgentEventPayload(payload)
  if (!agentPayload) return

  trackToolRunFromAgentEvent(agentPayload, set, get)
  handleCompactionStatus(agentPayload, set, get)
  handleFallbackStatus(agentPayload, set, get)
}

function parseChatRunEventPayload(payload: unknown): ChatRunEventPayload | null {
  if (!payload || typeof payload !== 'object') return null
  return payload as ChatRunEventPayload
}

function isChatTerminalState(state: string | undefined): boolean {
  return state === 'final' || state === 'error' || state === 'aborted'
}

function handleChatDeltaRun(runId: string, sessionKey: string, set: StoreSetter, get: StoreGetter): void {
  const existing = get().activeRuns[runId]
  if (existing?.sessionKey === sessionKey) return

  set((state) => ({
    activeRuns: { ...state.activeRuns, [runId]: { sessionKey, startedAt: Date.now() } },
  }))
}

function handleChatTerminalRun(runId: string, set: StoreSetter): void {
  set((state) => {
    const next = { ...state.activeRuns }
    delete next[runId]
    return { activeRuns: next, sessionRefreshHint: state.sessionRefreshHint + 1 }
  })
}

function handleChatEvent(payload: unknown, set: StoreSetter, get: StoreGetter): void {
  const chatPayload = parseChatRunEventPayload(payload)
  if (!chatPayload?.runId || !chatPayload.sessionKey) return

  if (chatPayload.state === 'delta') {
    handleChatDeltaRun(chatPayload.runId, chatPayload.sessionKey, set, get)
    return
  }

  if (!isChatTerminalState(chatPayload.state)) return
  handleChatTerminalRun(chatPayload.runId, set)
}

function collectStaleRunIds(
  activeRuns: Record<string, { sessionKey: string; startedAt: number }>,
  now: number,
): string[] {
  const staleRunIds: string[] = []
  for (const [runId, runState] of Object.entries(activeRuns)) {
    if (now - runState.startedAt > STALE_RUN_MAX_AGE_MS) {
      staleRunIds.push(runId)
    }
  }
  return staleRunIds
}

function handleTickEvent(_payload: unknown, set: StoreSetter, get: StoreGetter): void {
  const staleRunIds = collectStaleRunIds(get().activeRuns, Date.now())
  if (staleRunIds.length === 0) return

  set((state) => {
    const next = { ...state.activeRuns }
    for (const runId of staleRunIds) {
      delete next[runId]
    }
    return { activeRuns: next }
  })
}

const STORE_EVENT_HANDLERS: Record<string, StoreEventHandler> = {
  sessions: handleSessionsEvent,
  health: handleHealthEvent,
  presence: handlePresenceEvent,
  config: handleConfigEvent,
  channels: handleChannelsEvent,
  skills: handleSkillsEvent,
  'cron.status': handleCronStatusEvent,
  'cron.jobs': handleCronJobsEvent,
  agent: handleAgentEvent,
  chat: handleChatEvent,
  tick: handleTickEvent,
}

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
          const msg = err instanceof Error ? err.message : String(err)
          if (
            msg.includes('scope') ||
            msg.includes('permission') ||
            msg.includes('forbidden') ||
            msg.includes('unauthorized')
          ) {
            set({ scopeError: 'Insufficient permissions — check gateway auth configuration' })
          } else {
            log.warn('Initial data fetch failed', msg)
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
      clearStatusTimers()
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
      set(defaults === undefined ? { sessions } : { sessions, sessionsDefaults: defaults }),
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

      appendEventLogIfEnabled(event, payload, set, get)

      const handler = STORE_EVENT_HANDLERS[event]
      if (handler) {
        handler(payload, set, get)
        return
      }

      if (import.meta.env.DEV) {
        log.debug(`Unhandled event: ${event}`, payload as Record<string, unknown>)
      }
    },
  })),
)

export const selectIsConnected = (s: GatewayStore) => s.state === 'connected'
export const selectClient = (s: GatewayStore) => s.client
export const selectAgents = (s: GatewayStore) => s.agents
export const selectSessions = (s: GatewayStore) => s.sessions
export const selectChannels = (s: GatewayStore) => s.channels
export const selectPresence = (s: GatewayStore) => s.presence
export const selectScopeError = (s: GatewayStore) => s.scopeError
export const selectActiveRuns = (s: GatewayStore) => s.activeRuns
