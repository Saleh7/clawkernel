import type {
  CostUsageDailyEntry,
  CostUsageTotals,
  SessionUsageEntry,
  UsageActivityHeatmap,
  UsageClientFilters,
  UsageFacetOption,
  UsageFacetOptions,
  UsageInsightRow,
  UsageSessionRow,
  UsageSessionSort,
  UsageSummaryStats,
  UsageTimeZone,
} from './types'
import { createEmptyTotals, getSessionLastActivity, getUsageLabel, mergeTotals } from './utils'

export const USAGE_FILTER_ALL = '__all__'

type SessionUsageDimension = {
  provider: string
  model: string
  count: number
  totals: CostUsageTotals
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

function normalizeLabel(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim()
  return trimmed || fallback
}

function buildSessionUsageDimensions(session: SessionUsageEntry): SessionUsageDimension[] {
  if (session.usage?.modelUsage && session.usage.modelUsage.length > 0) {
    return session.usage.modelUsage.map((entry) => ({
      provider: normalizeLabel(entry.provider, 'Unknown provider'),
      model: normalizeLabel(entry.model, 'Unknown model'),
      count: entry.count,
      totals: entry.totals,
    }))
  }

  if (!session.usage) return []

  return [
    {
      provider: normalizeLabel(
        session.providerOverride ?? session.modelProvider ?? session.origin?.provider,
        'Unknown provider',
      ),
      model: normalizeLabel(session.modelOverride ?? session.model, 'Unknown model'),
      count: 1,
      totals: session.usage,
    },
  ]
}

export function getUsageChannelLabel(session: SessionUsageEntry): string {
  return normalizeLabel(session.channel ?? session.chatType ?? session.origin?.chatType, 'unknown')
}

export function getUsageAgentKey(session: SessionUsageEntry): string {
  return normalizeLabel(session.agentId, 'unassigned')
}

export function getUsageProviderLabel(session: SessionUsageEntry): string {
  const [first] = buildSessionUsageDimensions(session)
  return first?.provider ?? normalizeLabel(session.origin?.provider, 'Unknown provider')
}

export function getUsageModelLabel(session: SessionUsageEntry): string {
  const [first] = buildSessionUsageDimensions(session)
  if (!first) return 'Unknown model'
  return `${first.provider}/${first.model}`
}

function getSessionProviderLabels(session: SessionUsageEntry): string[] {
  const providers = new Set(buildSessionUsageDimensions(session).map((entry) => entry.provider))
  if (providers.size === 0) providers.add(normalizeLabel(session.origin?.provider, 'Unknown provider'))
  return Array.from(providers)
}

function getSessionModelLabels(session: SessionUsageEntry): string[] {
  const models = new Set(buildSessionUsageDimensions(session).map((entry) => entry.model))
  if (models.size === 0) models.add(normalizeLabel(session.modelOverride ?? session.model, 'Unknown model'))
  return Array.from(models)
}

function getSessionToolNames(session: SessionUsageEntry): string[] {
  return (session.usage?.toolUsage?.tools ?? [])
    .map((tool) => tool.name.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
}

function sortFacetOptions<T extends UsageFacetOption & { metric: number }>(entries: T[]): UsageFacetOption[] {
  return [...entries]
    .sort((a, b) => b.metric - a.metric || a.label.localeCompare(b.label))
    .map(({ metric: _metric, ...entry }) => entry)
}

export function buildUsageFacetOptions(
  sessions: SessionUsageEntry[],
  agentNameById: ReadonlyMap<string, string>,
): UsageFacetOptions {
  const agents = new Map<string, { label: string; metric: number }>()
  const channels = new Map<string, { label: string; metric: number }>()
  const providers = new Map<string, { label: string; metric: number }>()
  const models = new Map<string, { label: string; metric: number }>()
  const tools = new Map<string, { label: string; metric: number }>()

  for (const session of sessions) {
    const usage = session.usage
    const totalTokens = usage?.totalTokens ?? 0
    const agentId = getUsageAgentKey(session)
    const agentLabel = agentNameById.get(agentId) ?? agentId
    const channel = getUsageChannelLabel(session)

    const agentEntry = agents.get(agentId) ?? { label: agentLabel, metric: 0 }
    agentEntry.metric += totalTokens
    agents.set(agentId, agentEntry)

    const channelEntry = channels.get(channel) ?? { label: channel, metric: 0 }
    channelEntry.metric += totalTokens
    channels.set(channel, channelEntry)

    for (const dimension of buildSessionUsageDimensions(session)) {
      const providerEntry = providers.get(dimension.provider) ?? { label: dimension.provider, metric: 0 }
      providerEntry.metric += dimension.totals.totalTokens
      providers.set(dimension.provider, providerEntry)

      const modelEntry = models.get(dimension.model) ?? { label: dimension.model, metric: 0 }
      modelEntry.metric += dimension.totals.totalTokens
      models.set(dimension.model, modelEntry)
    }

    for (const tool of getSessionToolNames(session)) {
      const toolEntry = tools.get(tool) ?? { label: tool, metric: 0 }
      toolEntry.metric += usage?.toolUsage?.tools.find((entry) => entry.name === tool)?.count ?? 0
      tools.set(tool, toolEntry)
    }
  }

  return {
    agents: sortFacetOptions(Array.from(agents, ([value, entry]) => ({ value, ...entry }))),
    channels: sortFacetOptions(Array.from(channels, ([value, entry]) => ({ value, ...entry }))),
    providers: sortFacetOptions(Array.from(providers, ([value, entry]) => ({ value, ...entry }))),
    models: sortFacetOptions(Array.from(models, ([value, entry]) => ({ value, ...entry }))),
    tools: sortFacetOptions(Array.from(tools, ([value, entry]) => ({ value, ...entry }))),
  }
}

function buildSessionHaystack(session: SessionUsageEntry, agentNameById: ReadonlyMap<string, string>): string {
  const parts = [
    getUsageLabel(session),
    session.key,
    session.sessionId,
    getUsageAgentKey(session),
    agentNameById.get(getUsageAgentKey(session)),
    getUsageChannelLabel(session),
    session.origin?.label,
    session.origin?.surface,
    session.origin?.from,
    session.origin?.to,
    ...getSessionProviderLabels(session),
    ...getSessionModelLabels(session),
    ...getSessionToolNames(session),
  ]

  return parts
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .join(' ')
    .toLowerCase()
}

export function filterUsageSessions(
  sessions: SessionUsageEntry[],
  filters: UsageClientFilters,
  agentNameById: ReadonlyMap<string, string>,
): SessionUsageEntry[] {
  const normalizedQuery = filters.query.trim().toLowerCase()

  return sessions.filter((session) => {
    if (filters.agentId !== USAGE_FILTER_ALL && getUsageAgentKey(session) !== filters.agentId) return false
    if (filters.channel !== USAGE_FILTER_ALL && getUsageChannelLabel(session) !== filters.channel) return false
    if (filters.provider !== USAGE_FILTER_ALL && !getSessionProviderLabels(session).includes(filters.provider))
      return false
    if (filters.model !== USAGE_FILTER_ALL && !getSessionModelLabels(session).includes(filters.model)) return false
    if (filters.tool !== USAGE_FILTER_ALL && !getSessionToolNames(session).includes(filters.tool)) return false
    if (!normalizedQuery) return true
    return buildSessionHaystack(session, agentNameById).includes(normalizedQuery)
  })
}

function safeAvg(total: number, count: number): number | null {
  return count > 0 ? total / count : null
}

export function buildUsageOverviewStats(sessions: SessionUsageEntry[]): UsageSummaryStats {
  const totals = createEmptyTotals()
  const activeAgents = new Set<string>()
  const uniqueTools = new Set<string>()

  let latencyTotal = 0
  let latencyCount = 0
  let durationTotal = 0
  let durationCount = 0
  let messages = 0
  let userMessages = 0
  let assistantMessages = 0
  let toolCalls = 0
  let toolResults = 0
  let errors = 0

  for (const session of sessions) {
    mergeTotals(totals, session.usage)
    activeAgents.add(getUsageAgentKey(session))
    accumulateLatency(session)
    accumulateDuration(session)
    accumulateMessages(session)

    for (const tool of getSessionToolNames(session)) {
      uniqueTools.add(tool)
    }
  }

  function accumulateLatency(session: SessionUsageEntry) {
    const latency = session.usage?.latency
    if (latency && latency.count > 0) {
      latencyTotal += latency.avgMs * latency.count
      latencyCount += latency.count
    }
  }

  function accumulateDuration(session: SessionUsageEntry) {
    const durationMs = session.usage?.durationMs ?? 0
    if (durationMs > 0) {
      durationTotal += durationMs
      durationCount += 1
    }
  }

  function accumulateMessages(session: SessionUsageEntry) {
    const messageCounts = session.usage?.messageCounts
    if (!messageCounts) return
    messages += messageCounts.total
    userMessages += messageCounts.user
    assistantMessages += messageCounts.assistant
    toolCalls += messageCounts.toolCalls
    toolResults += messageCounts.toolResults
    errors += messageCounts.errors
  }

  const promptTokens = totals.input + totals.cacheRead

  return {
    messages,
    userMessages,
    assistantMessages,
    toolCalls,
    toolResults,
    errors,
    uniqueTools: uniqueTools.size,
    sessionCount: sessions.length,
    activeAgents: activeAgents.size,
    avgLatencyMs: safeAvg(latencyTotal, latencyCount),
    avgDurationMs: safeAvg(durationTotal, durationCount),
    avgTokensPerMessage: safeAvg(totals.totalTokens, messages),
    avgCostPerMessage: safeAvg(totals.totalCost, messages),
    throughputTokensPerMinute: durationTotal > 0 ? totals.totalTokens / (durationTotal / 60_000) : null,
    errorRate: safeAvg(errors, messages),
    cacheHitRate: safeAvg(totals.cacheRead, promptTokens),
    promptTokens,
    totals,
  }
}

export function buildUsageDailyPoints(
  sessions: SessionUsageEntry[],
  fallbackDaily: CostUsageDailyEntry[] = [],
): Array<{ date: string; tokens: number; cost: number }> {
  const daily = new Map<string, { date: string; tokens: number; cost: number }>()

  for (const session of sessions) {
    for (const entry of session.usage?.dailyBreakdown ?? []) {
      const existing = daily.get(entry.date) ?? { date: entry.date, tokens: 0, cost: 0 }
      existing.tokens += entry.tokens
      existing.cost += entry.cost
      daily.set(entry.date, existing)
    }
  }

  if (daily.size === 0) {
    for (const entry of fallbackDaily) {
      daily.set(entry.date, { date: entry.date, tokens: entry.totalTokens, cost: entry.totalCost })
    }
  }

  return Array.from(daily.values()).sort((a, b) => a.date.localeCompare(b.date))
}

export function buildUsageActivityHeatmap(
  sessions: SessionUsageEntry[],
  timeZone: UsageTimeZone,
): UsageActivityHeatmap {
  const weekdayBuckets = WEEKDAY_LABELS.map((label) => ({ label, tokens: 0, sessions: 0, intensity: 0 }))
  const hourBuckets = Array.from({ length: 24 }, (_unused, index) => ({
    label: String(index),
    tokens: 0,
    sessions: 0,
    intensity: 0,
  }))

  for (const session of sessions) {
    const lastActivity = getSessionLastActivity(session)
    if (!lastActivity) continue

    const date = new Date(lastActivity)
    const weekday = timeZone === 'utc' ? date.getUTCDay() : date.getDay()
    const hour = timeZone === 'utc' ? date.getUTCHours() : date.getHours()
    const weight = session.usage?.totalTokens ?? 0

    weekdayBuckets[weekday].tokens += weight
    weekdayBuckets[weekday].sessions += 1
    hourBuckets[hour].tokens += weight
    hourBuckets[hour].sessions += 1
  }

  const maxWeekdayTokens = Math.max(...weekdayBuckets.map((bucket) => bucket.tokens), 0)
  const maxHourTokens = Math.max(...hourBuckets.map((bucket) => bucket.tokens), 0)

  for (const bucket of weekdayBuckets) {
    bucket.intensity = maxWeekdayTokens > 0 ? bucket.tokens / maxWeekdayTokens : 0
  }
  for (const bucket of hourBuckets) {
    bucket.intensity = maxHourTokens > 0 ? bucket.tokens / maxHourTokens : 0
  }

  return { weekdays: weekdayBuckets, hours: hourBuckets }
}

function sortInsightRows(rows: UsageInsightRow[]): UsageInsightRow[] {
  return [...rows].sort(
    (a, b) => b.cost - a.cost || b.tokens - a.tokens || b.count - a.count || a.label.localeCompare(b.label),
  )
}

export function buildModelInsights(sessions: SessionUsageEntry[]): UsageInsightRow[] {
  const rows = new Map<string, UsageInsightRow>()

  for (const session of sessions) {
    for (const dimension of buildSessionUsageDimensions(session)) {
      const key = `${dimension.provider}::${dimension.model}`
      const existing = rows.get(key) ?? {
        key,
        label: dimension.model,
        secondary: dimension.provider,
        tokens: 0,
        cost: 0,
        count: 0,
      }
      existing.tokens += dimension.totals.totalTokens
      existing.cost += dimension.totals.totalCost
      existing.count += dimension.count
      rows.set(key, existing)
    }
  }

  return sortInsightRows(Array.from(rows.values()))
}

export function buildProviderInsights(sessions: SessionUsageEntry[]): UsageInsightRow[] {
  const rows = new Map<string, UsageInsightRow>()

  for (const session of sessions) {
    for (const dimension of buildSessionUsageDimensions(session)) {
      const existing = rows.get(dimension.provider) ?? {
        key: dimension.provider,
        label: dimension.provider,
        tokens: 0,
        cost: 0,
        count: 0,
      }
      existing.tokens += dimension.totals.totalTokens
      existing.cost += dimension.totals.totalCost
      existing.count += dimension.count
      rows.set(dimension.provider, existing)
    }
  }

  return sortInsightRows(Array.from(rows.values()))
}

export function buildAgentInsights(
  sessions: SessionUsageEntry[],
  agentNameById: ReadonlyMap<string, string>,
): UsageInsightRow[] {
  const rows = new Map<string, UsageInsightRow>()

  for (const session of sessions) {
    const agentId = getUsageAgentKey(session)
    const existing = rows.get(agentId) ?? {
      key: agentId,
      label: agentNameById.get(agentId) ?? agentId,
      secondary: agentId,
      tokens: 0,
      cost: 0,
      count: 0,
    }
    existing.tokens += session.usage?.totalTokens ?? 0
    existing.cost += session.usage?.totalCost ?? 0
    existing.count += 1
    rows.set(agentId, existing)
  }

  return sortInsightRows(Array.from(rows.values()))
}

export function buildChannelInsights(sessions: SessionUsageEntry[]): UsageInsightRow[] {
  const rows = new Map<string, UsageInsightRow>()

  for (const session of sessions) {
    const channel = getUsageChannelLabel(session)
    const existing = rows.get(channel) ?? {
      key: channel,
      label: channel,
      tokens: 0,
      cost: 0,
      count: 0,
    }
    existing.tokens += session.usage?.totalTokens ?? 0
    existing.cost += session.usage?.totalCost ?? 0
    existing.count += 1
    rows.set(channel, existing)
  }

  return sortInsightRows(Array.from(rows.values()))
}

export function buildToolInsights(sessions: SessionUsageEntry[]): UsageInsightRow[] {
  const rows = new Map<string, UsageInsightRow>()

  for (const session of sessions) {
    for (const tool of session.usage?.toolUsage?.tools ?? []) {
      const key = tool.name.trim()
      if (!key) continue
      const existing = rows.get(key) ?? {
        key,
        label: key,
        tokens: 0,
        cost: 0,
        count: 0,
      }
      existing.count += tool.count
      rows.set(key, existing)
    }
  }

  return [...rows.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

export function buildPeakErrorDayInsights(sessions: SessionUsageEntry[]): UsageInsightRow[] {
  const rows = new Map<string, UsageInsightRow>()

  for (const session of sessions) {
    const dailyMessageCounts = session.usage?.dailyMessageCounts
    if (dailyMessageCounts && dailyMessageCounts.length > 0) {
      for (const entry of dailyMessageCounts) {
        const existing = rows.get(entry.date) ?? {
          key: entry.date,
          label: entry.date,
          tokens: 0,
          cost: 0,
          count: 0,
        }
        existing.tokens += session.usage?.dailyBreakdown?.find((day) => day.date === entry.date)?.tokens ?? 0
        existing.count += entry.errors
        // NOTE: `cost` is overloaded here to store total message count (not dollars),
        // used downstream to compute error rate as `count / cost`.
        existing.cost += entry.total
        rows.set(entry.date, existing)
      }
      continue
    }

    const lastActivity = getSessionLastActivity(session)
    if (!lastActivity) continue
    const date = new Date(lastActivity).toISOString().slice(0, 10)
    const existing = rows.get(date) ?? {
      key: date,
      label: date,
      tokens: 0,
      cost: 0,
      count: 0,
    }
    existing.tokens += session.usage?.totalTokens ?? 0
    existing.count += session.usage?.messageCounts?.errors ?? 0
    existing.cost += session.usage?.messageCounts?.total ?? 0
    rows.set(date, existing)
  }

  return [...rows.values()].sort((a, b) => {
    const aRate = a.cost > 0 ? a.count / a.cost : 0
    const bRate = b.cost > 0 ? b.count / b.cost : 0
    return bRate - aRate || b.count - a.count || a.label.localeCompare(b.label)
  })
}

export function sortUsageSessionRows(rows: UsageSessionRow[], sort: UsageSessionSort): UsageSessionRow[] {
  const sorted = [...rows]

  sorted.sort((a, b) => {
    switch (sort) {
      case 'tokens':
        return b.totalTokens - a.totalTokens || (b.lastActive ?? 0) - (a.lastActive ?? 0)
      case 'cost':
        return b.cost - a.cost || b.totalTokens - a.totalTokens
      case 'errors':
        return b.errorCount - a.errorCount || (b.lastActive ?? 0) - (a.lastActive ?? 0)
      default:
        return (b.lastActive ?? 0) - (a.lastActive ?? 0)
    }
  })

  return sorted
}
