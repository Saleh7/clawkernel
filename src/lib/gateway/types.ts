//  Gateway protocol types — adapted from OpenClaw Control UI

export type GatewayResponseFrame = {
  type: 'res'
  id: string
  ok: boolean
  payload?: unknown
  error?: { code: string; message: string; details?: unknown }
}

export type GatewayEventFrame = {
  type: 'event'
  event: string
  payload?: unknown
  seq?: number
  stateVersion?: { presence: number; health: number }
}

export type GatewayHelloOk = {
  type: 'hello-ok'
  protocol: number
  features?: { methods?: Array<string>; events?: Array<string> }
  snapshot?: GatewaySnapshot
  auth?: {
    deviceToken?: string
    role?: string
    scopes?: Array<string>
    issuedAtMs?: number
  }
  policy?: { tickIntervalMs?: number }
}

export type GatewaySnapshot = {
  agents?: AgentsListResult
  sessions?: SessionsListResult
  channels?: ChannelsStatusSnapshot
  health?: HealthSnapshot
  config?: ConfigSnapshot
  skills?: SkillStatusReport
  cron?: { status?: CronStatus; jobs?: Array<CronJob> }
  presence?: Record<string, PresenceEntry>
}

export type AgentIdentity = {
  name?: string
  theme?: string
  emoji?: string
  avatar?: string
  avatarUrl?: string
}

export type GatewayAgentRow = {
  id: string
  name?: string
  identity?: AgentIdentity
}

export type AgentsListResult = {
  defaultId: string
  mainKey: string
  scope: string
  agents: Array<GatewayAgentRow>
}

export type GatewaySessionRow = {
  key: string
  kind: 'direct' | 'group' | 'global' | 'unknown'
  label?: string
  displayName?: string
  surface?: string
  channel?: string
  lastTo?: string
  lastChannel?: string
  lastAccountId?: string
  chatType?: string
  subject?: string
  room?: string
  space?: string
  updatedAt: number | null
  sessionId?: string
  systemSent?: boolean
  abortedLastRun?: boolean
  thinkingLevel?: string
  verboseLevel?: string
  reasoningLevel?: string
  elevatedLevel?: string
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  model?: string
  modelProvider?: string
  contextTokens?: number
}

export type GatewaySessionsDefaults = {
  model: string | null
  contextTokens: number | null
}

export type SessionsListResult = {
  ts: number
  path: string
  count: number
  defaults: GatewaySessionsDefaults
  sessions: Array<GatewaySessionRow>
}

export type SessionsPatchResult = {
  ok: true
  path: string
  key: string
  entry: {
    sessionId: string
    updatedAt?: number
    thinkingLevel?: string
    verboseLevel?: string
    reasoningLevel?: string
    elevatedLevel?: string
  }
}

export type ChatHistoryResult = {
  sessionKey: string
  sessionId?: string
  messages: Array<ChatMessage>
  thinkingLevel?: string
}

export type ChatMessage = {
  role?: string
  content?: Array<ChatMessageContent>
  toolCallId?: string
  toolName?: string
  details?: Record<string, unknown>
  isError?: boolean
  timestamp?: number
  clientId?: string
  __optimisticId?: string
  [key: string]: unknown
}

export type ChatMessageContent =
  | { type: 'text'; text?: string; textSignature?: string }
  | { type: 'thinking'; thinking?: string; thinkingSignature?: string }
  | { type: 'toolCall'; id?: string; name?: string; arguments?: Record<string, unknown>; partialJson?: string }
  | { type: 'toolResult'; toolCallId?: string; content?: Array<{ type?: string; text?: string }>; isError?: boolean }
  | {
      type: 'image'
      source?: unknown
      url?: string
      omitted?: boolean
      bytes?: number
      mimeType?: string
      media_type?: string
    }
  | { type: 'image_url'; image_url?: { url: string } }

export type ChatEventPayload = {
  runId: string
  sessionKey: string
  state: 'delta' | 'final' | 'aborted' | 'error'
  message?: ChatMessage
  errorMessage?: string
}

export type ChannelAccountSnapshot = {
  accountId: string
  name?: string | null
  enabled?: boolean | null
  configured?: boolean | null
  running?: boolean | null
  connected?: boolean | null
  lastError?: string | null
}

export type ChannelsStatusSnapshot = {
  ts: number
  channelOrder: Array<string>
  channelLabels: Record<string, string>
  channelDetailLabels?: Record<string, string>
  channels: Record<string, unknown>
  channelAccounts: Record<string, Array<ChannelAccountSnapshot>>
  channelDefaultAccountId: Record<string, string>
}

export type ConfigSnapshot = {
  path?: string | null
  exists?: boolean | null
  raw?: string | null
  hash?: string | null
  parsed?: unknown
  valid?: boolean | null
  config?: Record<string, unknown> | null
  issues?: Array<{ path: string; message: string }>
}

export type HealthSnapshot = Record<string, unknown>

export type PresenceEntry = {
  instanceId?: string | null
  host?: string | null
  ip?: string | null
  version?: string | null
  platform?: string | null
  mode?: string | null
  lastInputSeconds?: number | null
  ts?: number | null
}

export type CronSchedule =
  | { kind: 'at'; at: string }
  | { kind: 'every'; everyMs: number; anchorMs?: number }
  | { kind: 'cron'; expr: string; tz?: string; staggerMs?: number }

export type CronPayload =
  | { kind: 'systemEvent'; text: string }
  | { kind: 'agentTurn'; message: string; model?: string; thinking?: string; timeoutSeconds?: number }

export type CronDeliveryMode = 'none' | 'announce' | 'webhook'

export type CronDelivery = {
  mode: CronDeliveryMode
  channel?: string
  to?: string
  bestEffort?: boolean
}

export type CronJobState = {
  nextRunAtMs?: number
  runningAtMs?: number
  lastRunAtMs?: number
  lastStatus?: 'ok' | 'error' | 'skipped'
  lastError?: string
  lastDurationMs?: number
  consecutiveErrors?: number
  lastDeliveryStatus?: CronDeliveryStatus
}

export type CronJob = {
  id: string
  agentId?: string
  name: string
  description?: string
  enabled: boolean
  deleteAfterRun?: boolean
  createdAtMs: number
  updatedAtMs: number
  schedule: CronSchedule
  sessionTarget: 'main' | 'isolated'
  wakeMode: 'next-heartbeat' | 'now'
  payload: CronPayload
  delivery?: CronDelivery
  state?: CronJobState
}

export type CronStatus = {
  enabled: boolean
  jobs: number
  nextWakeAtMs?: number | null
}

export type CronJobsEnabledFilter = 'all' | 'enabled' | 'disabled'
export type CronJobsSortBy = 'nextRunAtMs' | 'updatedAtMs' | 'name'
export type CronSortDir = 'asc' | 'desc'
export type CronDeliveryStatus = 'delivered' | 'not-delivered' | 'unknown' | 'not-requested'

export type CronRunLogEntry = {
  ts: number
  jobId: string
  jobName?: string
  status?: 'ok' | 'error' | 'skipped'
  error?: string
  summary?: string
  deliveryStatus?: CronDeliveryStatus
  deliveryError?: string
  delivered?: boolean
  sessionId?: string
  sessionKey?: string
  runAtMs?: number
  durationMs?: number
  nextRunAtMs?: number
  model?: string
  provider?: string
}

export type CronJobsListResult = {
  jobs?: CronJob[]
  total?: number
  offset?: number
  limit?: number
  hasMore?: boolean
  nextOffset?: number | null
}

export type CronRunsResult = {
  entries?: CronRunLogEntry[]
  total?: number
  offset?: number
  limit?: number
  hasMore?: boolean
  nextOffset?: number | null
}

export type SkillStatusEntry = {
  name: string
  description: string
  source: string
  filePath: string
  baseDir: string
  skillKey: string
  bundled?: boolean
  emoji?: string
  homepage?: string
  always: boolean
  disabled: boolean
  blockedByAllowlist: boolean
  eligible: boolean
  requirements: { bins: Array<string>; env: Array<string>; config: Array<string>; os: Array<string> }
  missing: { bins: Array<string>; env: Array<string>; config: Array<string>; os: Array<string> }
  install: Array<{ id: string; kind: string; label: string; bins: Array<string> }>
}

export type SkillStatusReport = {
  workspaceDir: string
  managedSkillsDir: string
  skills: Array<SkillStatusEntry>
}

export type ToolCatalogEntry = {
  id: string
  label: string
  description: string
  source: 'core' | 'plugin'
  pluginId?: string
  optional?: boolean
  defaultProfiles: Array<'minimal' | 'coding' | 'messaging' | 'full'>
}

export type ToolCatalogGroup = {
  id: string
  label: string
  source: 'core' | 'plugin'
  pluginId?: string
  tools: Array<ToolCatalogEntry>
}

export type ToolCatalogProfile = {
  id: string
  label: string
}

export type ToolsCatalogResult = {
  agentId: string
  profiles: Array<ToolCatalogProfile>
  groups: Array<ToolCatalogGroup>
}

export type AgentsCreateResult = {
  ok: true
  agentId: string
  name: string
  workspace: string
}

export type AgentsDeleteResult = {
  ok: true
  agentId: string
  removedBindings: number
}

export type AgentIdentityResult = {
  agentId: string
  name: string
  avatar: string
  emoji?: string
}

export type AgentFileEntry = {
  name: string
  path: string
  missing: boolean
  size?: number
  updatedAtMs?: number
  content?: string
}

export type BrowserStatus = {
  enabled: boolean
  profile: string
  running: boolean
  cdpReady: boolean
  cdpHttp: boolean
  cdpPort: number | null
  cdpUrl: string | null
  chosenBrowser: string | null
  detectedBrowser: string | null
  detectedExecutablePath: string | null
  detectError: string | null
  userDataDir: string | null
  color: string | null
  headless: boolean
  attachOnly: boolean
}

export type TtsAutoMode = 'off' | 'always' | 'inbound' | 'tagged'

export type TtsStatus = {
  enabled: boolean
  auto: TtsAutoMode
  provider: string
  fallbackProvider: string | null
  fallbackProviders: string[]
  prefsPath?: string
  hasOpenAIKey: boolean
  hasElevenLabsKey: boolean
  edgeEnabled: boolean
}

export type TtsProvider = {
  id: string
  name: string
  configured: boolean
  models: string[]
  voices?: string[]
}

export type TtsProvidersResult = {
  providers: TtsProvider[]
  active: string
}

export type TtsConvertResult = {
  audioPath: string
  provider: string
  outputFormat: string
  voiceCompatible: boolean
}

export type TalkConfigPayload = {
  voiceId?: string
  voiceAliases?: Record<string, string>
  modelId?: string
  outputFormat?: string
  interruptOnSpeech?: boolean
  [key: string]: unknown
}

export type TalkConfigResult = {
  config: {
    talk?: TalkConfigPayload
    session?: { mainKey: string }
    ui?: { seamColor: string }
  }
}

export type VoiceWakeResult = {
  triggers: string[]
}

export type ModelCatalogEntry = {
  id: string
  name: string
  provider: string
  contextWindow?: number
  reasoning?: boolean
  input?: Array<'text' | 'image'>
}

export type ModelsListResult = {
  models: ModelCatalogEntry[]
}

export type SessionPreviewItem = { role: 'user' | 'assistant' | 'tool' | 'system' | 'other'; text: string }
export type SessionsPreviewEntry = {
  key: string
  status: 'ok' | 'empty' | 'missing' | 'error'
  items: SessionPreviewItem[]
}
export type SessionsPreviewResult = { ts: number; previews: SessionsPreviewEntry[] }

export type GatewayClientOptions = {
  /** WebSocket URL, e.g. ws://127.0.0.1:18789 */
  url: string
  /** Shared auth token */
  token?: string
  /** Shared auth password */
  password?: string
  /** Client display name */
  clientName?: string
  /** Client version */
  clientVersion?: string
  /** Unique instance id */
  instanceId?: string
  /** Fallback delay (ms) before sending connect if no challenge nonce arrives. Default: 750 */
  connectFallbackMs?: number
}

export type ConnectionState = 'disconnected' | 'connecting' | 'authenticating' | 'connected' | 'reconnecting'
