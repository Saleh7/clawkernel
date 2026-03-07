export type UsageTimeZone = 'local' | 'utc'
export type UsagePeriod = '1h' | '24h' | '7d' | 'all'
export type UsageChartMode = 'tokens' | 'cost'
export type UsageSessionSort = 'recent' | 'tokens' | 'cost' | 'errors'

export type CostUsageTotals = {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  totalTokens: number
  totalCost: number
  inputCost: number
  outputCost: number
  cacheReadCost: number
  cacheWriteCost: number
  missingCostEntries: number
}

export type CostUsageDailyEntry = CostUsageTotals & {
  date: string
}

export type CostUsageSummary = {
  updatedAt: number
  days: number
  daily: CostUsageDailyEntry[]
  totals: CostUsageTotals
}

type SessionLatencyStats = {
  count: number
  avgMs: number
  p95Ms: number
  minMs: number
  maxMs: number
}

type SessionModelUsage = {
  provider?: string
  model?: string
  count: number
  totals: CostUsageTotals
}

type SessionDailyUsage = {
  date: string
  tokens: number
  cost: number
}

type SessionDailyMessageCounts = {
  date: string
  total: number
  user: number
  assistant: number
  toolCalls: number
  toolResults: number
  errors: number
}

type SessionDailyLatency = {
  date: string
  count: number
  avgMs: number
  p95Ms: number
  minMs: number
  maxMs: number
}

type SessionDailyModelUsage = {
  date: string
  provider?: string
  model?: string
  tokens: number
  cost: number
  count: number
}

type SessionMessageCounts = {
  total: number
  user: number
  assistant: number
  toolCalls: number
  toolResults: number
  errors: number
}

type SessionToolUsage = {
  totalCalls: number
  uniqueTools: number
  tools: Array<{ name: string; count: number }>
}

export type SessionCostSummary = CostUsageTotals & {
  sessionId?: string
  sessionFile?: string
  firstActivity?: number
  lastActivity?: number
  durationMs?: number
  activityDates?: string[]
  dailyBreakdown?: SessionDailyUsage[]
  dailyMessageCounts?: SessionDailyMessageCounts[]
  dailyLatency?: SessionDailyLatency[]
  dailyModelUsage?: SessionDailyModelUsage[]
  messageCounts?: SessionMessageCounts
  toolUsage?: SessionToolUsage
  modelUsage?: SessionModelUsage[]
  latency?: SessionLatencyStats
}

export type SessionUsageEntry = {
  key: string
  label?: string
  sessionId?: string
  updatedAt?: number
  agentId?: string
  channel?: string
  chatType?: string
  origin?: {
    label?: string
    provider?: string
    surface?: string
    chatType?: string
    from?: string
    to?: string
    accountId?: string
    threadId?: string | number
  }
  modelOverride?: string
  providerOverride?: string
  modelProvider?: string
  model?: string
  usage: SessionCostSummary | null
  contextWeight?: SessionContextWeight | null
}

export type SessionsUsageAggregates = {
  messages: SessionMessageCounts
  tools: SessionToolUsage
  byModel: SessionModelUsage[]
  byProvider: SessionModelUsage[]
  byAgent: Array<{ agentId: string; totals: CostUsageTotals }>
  byChannel: Array<{ channel: string; totals: CostUsageTotals }>
  latency?: SessionLatencyStats
  dailyLatency?: SessionDailyLatency[]
  modelDaily?: SessionDailyModelUsage[]
  daily: Array<{
    date: string
    tokens: number
    cost: number
    messages: number
    toolCalls: number
    errors: number
  }>
}

export type SessionsUsageResult = {
  updatedAt: number
  startDate: string
  endDate: string
  sessions: SessionUsageEntry[]
  totals: CostUsageTotals
  aggregates: SessionsUsageAggregates
}

export type UsageDateInterpretationParams =
  | { mode: 'utc' }
  | {
      mode: 'specific'
      utcOffset: string
    }

export type UsageModelRow = {
  key: string
  provider?: string
  model?: string
  count: number
  totals: CostUsageTotals
}

export type UsageAgentRow = {
  agentId: string
  sessions: number
  models: string[]
  lastActive: number | null
  totals: CostUsageTotals
}

export type UsageSummaryStats = {
  messages: number
  userMessages: number
  assistantMessages: number
  toolCalls: number
  toolResults: number
  errors: number
  uniqueTools: number
  sessionCount: number
  activeAgents: number
  avgLatencyMs: number | null
  avgDurationMs: number | null
  avgTokensPerMessage: number | null
  avgCostPerMessage: number | null
  throughputTokensPerMinute: number | null
  errorRate: number | null
  cacheHitRate: number | null
  promptTokens: number
  totals: CostUsageTotals
}

export type UsageSessionRow = {
  key: string
  label: string
  agentId: string
  agentName: string
  channel: string
  providerLabel: string
  modelLabel: string
  inputTokens: number
  outputTokens: number
  cacheTokens: number
  totalTokens: number
  cost: number
  lastActive: number | null
  durationMs: number | null
  messageCount: number
  errorCount: number
  toolCalls: number
  contextPercent: number | null
  contextLimit: number | null
}

export type UsageFacetOption = {
  value: string
  label: string
}

export type UsageFacetOptions = {
  agents: UsageFacetOption[]
  channels: UsageFacetOption[]
  providers: UsageFacetOption[]
  models: UsageFacetOption[]
  tools: UsageFacetOption[]
}

export type UsageClientFilters = {
  query: string
  agentId: string
  channel: string
  provider: string
  model: string
  tool: string
}

export type UsageDailyPoint = {
  date: string
  tokens: number
  cost: number
}

export type UsageActivityBucket = {
  label: string
  tokens: number
  sessions: number
  intensity: number
}

export type UsageActivityHeatmap = {
  weekdays: UsageActivityBucket[]
  hours: UsageActivityBucket[]
}

export type UsageInsightRow = {
  key: string
  label: string
  secondary?: string
  tokens: number
  cost: number
  count: number
}

export type SessionUsageTimePoint = {
  timestamp: number
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  totalTokens: number
  cost: number
  cumulativeTokens: number
  cumulativeCost: number
}

export type SessionUsageTimeSeries = {
  sessionId?: string
  points: SessionUsageTimePoint[]
}

export type SessionLogEntry = {
  timestamp: number
  role: 'user' | 'assistant' | 'tool' | 'toolResult'
  content: string
  tokens?: number
  cost?: number
}

export type SessionLogRole = SessionLogEntry['role']

export type SessionContextWeight = {
  systemPrompt?: { chars: number }
  skills?: {
    promptChars: number
    entries: Array<{ name: string; blockChars: number }>
  }
  tools?: {
    listChars: number
    schemaChars: number
    entries: Array<{ name: string; summaryChars: number; schemaChars: number }>
  }
  injectedWorkspaceFiles?: Array<{ name: string; injectedChars: number }>
}
