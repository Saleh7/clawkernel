import type { GatewaySessionRow, GatewaySessionsDefaults } from '@/lib/gateway/types'
import type {
  CostUsageTotals,
  SessionUsageEntry,
  UsageAgentRow,
  UsageChartMode,
  UsageDateInterpretationParams,
  UsageModelRow,
  UsagePeriod,
  UsageTimeZone,
} from './types'

const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000

const GATEWAY_SETTINGS_STORAGE_KEY = 'clawkernel-gateway'
const LEGACY_USAGE_DATE_PARAMS_STORAGE_KEY = 'clawkernel.usage.date-params.v1'
const LEGACY_USAGE_DATE_PARAMS_DEFAULT_GATEWAY_KEY = '__default__'
const LEGACY_USAGE_DATE_PARAMS_MODE_RE = /unexpected property ['"]mode['"]/i
const LEGACY_USAGE_DATE_PARAMS_OFFSET_RE = /unexpected property ['"]utcoffset['"]/i
const LEGACY_USAGE_DATE_PARAMS_INVALID_RE = /invalid sessions\.usage params/i

export function createEmptyTotals(): CostUsageTotals {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    totalCost: 0,
    inputCost: 0,
    outputCost: 0,
    cacheReadCost: 0,
    cacheWriteCost: 0,
    missingCostEntries: 0,
  }
}

export function mergeTotals(target: CostUsageTotals, source?: Partial<CostUsageTotals> | null): CostUsageTotals {
  if (!source) return target
  target.input += source.input ?? 0
  target.output += source.output ?? 0
  target.cacheRead += source.cacheRead ?? 0
  target.cacheWrite += source.cacheWrite ?? 0
  target.totalTokens += source.totalTokens ?? 0
  target.totalCost += source.totalCost ?? 0
  target.inputCost += source.inputCost ?? 0
  target.outputCost += source.outputCost ?? 0
  target.cacheReadCost += source.cacheReadCost ?? 0
  target.cacheWriteCost += source.cacheWriteCost ?? 0
  target.missingCostEntries += source.missingCostEntries ?? 0
  return target
}

export function formatCost(value: number): string {
  if (value === 0) return '$0.00'
  const digits = Math.abs(value) >= 1 ? 2 : 4
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)
}

export function formatLatency(value: number | null): string {
  if (value === null) return '—'
  if (value >= 1000) return `${(value / 1000).toFixed(1)}s`
  return `${Math.round(value)}ms`
}

export function formatPercent(value: number | null, digits = 1): string {
  if (value === null) return '—'
  return `${(value * 100).toFixed(digits)}%`
}

export function formatDurationCompact(value: number | null): string {
  if (value === null || value <= 0) return '—'

  const totalSeconds = Math.round(value / 1000)
  const days = Math.floor(totalSeconds / 86_400)
  const hours = Math.floor((totalSeconds % 86_400) / 3_600)
  const minutes = Math.floor((totalSeconds % 3_600) / 60)
  const seconds = totalSeconds % 60

  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

export function formatUsageDateTime(value: number | null, timeZone: UsageTimeZone): string {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    ...(timeZone === 'utc' ? { timeZone: 'UTC' } : {}),
  }).format(value)
}

export function formatShortDate(date: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(`${date}T12:00:00Z`))
}

function toDateInputValue(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getDefaultUsageDateRange(now = Date.now()): { startDate: string; endDate: string } {
  const end = new Date(now)
  const start = new Date(now)
  start.setDate(start.getDate() - 6)
  return {
    startDate: toDateInputValue(start),
    endDate: toDateInputValue(end),
  }
}

export function getUsagePresetRange(
  preset: 'today' | '7d' | '30d',
  now = Date.now(),
): { startDate: string; endDate: string } {
  const end = new Date(now)
  const start = new Date(now)

  switch (preset) {
    case 'today':
      return {
        startDate: toDateInputValue(start),
        endDate: toDateInputValue(end),
      }
    case '30d':
      start.setDate(start.getDate() - 29)
      break
    case '7d':
      start.setDate(start.getDate() - 6)
      break
  }

  return {
    startDate: toDateInputValue(start),
    endDate: toDateInputValue(end),
  }
}

export function getUsageRangePreset(
  startDate: string,
  endDate: string,
  now = Date.now(),
): 'today' | '7d' | '30d' | null {
  for (const preset of ['today', '7d', '30d'] as const) {
    const range = getUsagePresetRange(preset, now)
    if (range.startDate === startDate && range.endDate === endDate) return preset
  }
  return null
}

export function formatUsageModeLabel(mode: UsageChartMode): string {
  return mode === 'cost' ? 'Cost' : 'Tokens'
}

export function formatUtcOffset(timezoneOffsetMinutes: number): string {
  const offsetFromUtcMinutes = -timezoneOffsetMinutes
  const sign = offsetFromUtcMinutes >= 0 ? '+' : '-'
  const absMinutes = Math.abs(offsetFromUtcMinutes)
  const hours = Math.floor(absMinutes / 60)
  const minutes = absMinutes % 60
  return minutes === 0 ? `UTC${sign}${hours}` : `UTC${sign}${hours}:${String(minutes).padStart(2, '0')}`
}

export function buildDateInterpretationParams(
  timeZone: UsageTimeZone,
  includeDateInterpretation: boolean,
): UsageDateInterpretationParams | undefined {
  if (!includeDateInterpretation) return undefined
  if (timeZone === 'utc') return { mode: 'utc' }
  return {
    mode: 'specific',
    utcOffset: formatUtcOffset(new Date().getTimezoneOffset()),
  }
}

export function toErrorMessage(err: unknown): string {
  if (typeof err === 'string') return err
  if (err instanceof Error && err.message.trim()) return err.message
  if (err && typeof err === 'object') {
    try {
      const serialized = JSON.stringify(err)
      if (serialized) return serialized
    } catch {
      return 'request failed'
    }
  }
  return 'request failed'
}

export function isLegacyDateInterpretationUnsupportedError(err: unknown): boolean {
  const message = toErrorMessage(err)
  return (
    LEGACY_USAGE_DATE_PARAMS_INVALID_RE.test(message) &&
    (LEGACY_USAGE_DATE_PARAMS_MODE_RE.test(message) || LEGACY_USAGE_DATE_PARAMS_OFFSET_RE.test(message))
  )
}

function normalizeGatewayCompatibilityKey(gatewayUrl?: string): string {
  const trimmed = gatewayUrl?.trim()
  if (!trimmed) return LEGACY_USAGE_DATE_PARAMS_DEFAULT_GATEWAY_KEY
  try {
    const parsed = new URL(trimmed)
    const pathname = parsed.pathname === '/' ? '' : parsed.pathname
    return `${parsed.protocol}//${parsed.host}${pathname}`.toLowerCase()
  } catch {
    return trimmed.toLowerCase()
  }
}

function getLocalStorage(): Storage | null {
  if (globalThis.window?.localStorage) return globalThis.window.localStorage
  if (typeof localStorage !== 'undefined') return localStorage
  return null
}

function loadLegacyUsageDateParamsCache(): Set<string> {
  const storage = getLocalStorage()
  if (!storage) return new Set<string>()
  try {
    const raw = storage.getItem(LEGACY_USAGE_DATE_PARAMS_STORAGE_KEY)
    if (!raw) return new Set<string>()
    const parsed = JSON.parse(raw) as { unsupportedGatewayKeys?: unknown } | null
    if (!parsed || !Array.isArray(parsed.unsupportedGatewayKeys)) return new Set<string>()
    return new Set(
      parsed.unsupportedGatewayKeys
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter(Boolean),
    )
  } catch {
    return new Set<string>()
  }
}

function persistLegacyUsageDateParamsCache(cache: Set<string>) {
  const storage = getLocalStorage()
  if (!storage) return
  try {
    storage.setItem(LEGACY_USAGE_DATE_PARAMS_STORAGE_KEY, JSON.stringify({ unsupportedGatewayKeys: Array.from(cache) }))
  } catch {
    // Ignore storage write failures.
  }
}

export function getStoredGatewayCompatibilityKey(): string {
  const storage = getLocalStorage()
  if (!storage) return LEGACY_USAGE_DATE_PARAMS_DEFAULT_GATEWAY_KEY
  try {
    const raw = storage.getItem(GATEWAY_SETTINGS_STORAGE_KEY)
    if (!raw) return LEGACY_USAGE_DATE_PARAMS_DEFAULT_GATEWAY_KEY
    const parsed = JSON.parse(raw) as { url?: string } | null
    return normalizeGatewayCompatibilityKey(parsed?.url)
  } catch {
    return LEGACY_USAGE_DATE_PARAMS_DEFAULT_GATEWAY_KEY
  }
}

export function shouldSendLegacyDateInterpretation(gatewayKey: string): boolean {
  return !loadLegacyUsageDateParamsCache().has(gatewayKey)
}

export function rememberLegacyDateInterpretation(gatewayKey: string) {
  const cache = loadLegacyUsageDateParamsCache()
  cache.add(gatewayKey)
  persistLegacyUsageDateParamsCache(cache)
}

export function getSessionLastActivity(entry: SessionUsageEntry): number | null {
  return entry.usage?.lastActivity ?? entry.updatedAt ?? null
}

function getPeriodThreshold(period: UsagePeriod, now: number): number | null {
  switch (period) {
    case '1h':
      return now - HOUR_MS
    case '24h':
      return now - DAY_MS
    case '7d':
      return now - 7 * DAY_MS
    default:
      return null
  }
}

export function filterSessionsByPeriod(
  sessions: SessionUsageEntry[],
  period: UsagePeriod,
  now = Date.now(),
): SessionUsageEntry[] {
  const threshold = getPeriodThreshold(period, now)
  if (threshold === null) return sessions
  return sessions.filter((entry) => {
    const lastActivity = getSessionLastActivity(entry)
    return lastActivity !== null && lastActivity >= threshold
  })
}

function buildModelKey(provider?: string, model?: string): string {
  return `${provider ?? 'unknown'}::${model ?? 'unassigned'}`
}

function inferSessionModelUsage(
  session: SessionUsageEntry,
): Array<{ provider?: string; model?: string; count: number; totals: CostUsageTotals }> {
  if (session.usage?.modelUsage && session.usage.modelUsage.length > 0) {
    return session.usage.modelUsage.map((entry) => ({
      provider: entry.provider,
      model: entry.model,
      count: entry.count,
      totals: entry.totals,
    }))
  }

  if (!session.usage) return []

  return [
    {
      provider: session.providerOverride ?? session.modelProvider,
      model: session.modelOverride ?? session.model,
      count: 1,
      totals: session.usage,
    },
  ]
}

export function buildModelRows(sessions: SessionUsageEntry[]): UsageModelRow[] {
  const rows = new Map<string, UsageModelRow>()

  for (const session of sessions) {
    for (const usageEntry of inferSessionModelUsage(session)) {
      const key = buildModelKey(usageEntry.provider, usageEntry.model)
      const existing = rows.get(key) ?? {
        key,
        provider: usageEntry.provider,
        model: usageEntry.model,
        count: 0,
        totals: createEmptyTotals(),
      }
      existing.count += usageEntry.count
      mergeTotals(existing.totals, usageEntry.totals)
      rows.set(key, existing)
    }
  }

  return Array.from(rows.values()).sort(
    (a, b) => b.totals.totalCost - a.totals.totalCost || b.totals.totalTokens - a.totals.totalTokens,
  )
}

export function buildAgentRows(sessions: SessionUsageEntry[]): UsageAgentRow[] {
  const rows = new Map<string, UsageAgentRow & { modelSet: Set<string> }>()

  for (const session of sessions) {
    const agentId = session.agentId ?? 'unassigned'
    const existing = rows.get(agentId) ?? {
      agentId,
      sessions: 0,
      models: [],
      modelSet: new Set<string>(),
      lastActive: null,
      totals: createEmptyTotals(),
    }

    existing.sessions += 1
    mergeTotals(existing.totals, session.usage)

    const lastActivity = getSessionLastActivity(session)
    if (lastActivity && (!existing.lastActive || lastActivity > existing.lastActive)) {
      existing.lastActive = lastActivity
    }

    const modelRows = inferSessionModelUsage(session)
    for (const modelRow of modelRows) {
      const label = [modelRow.provider, modelRow.model].filter(Boolean).join('/') || 'unassigned'
      existing.modelSet.add(label)
    }

    rows.set(agentId, existing)
  }

  return Array.from(rows.values())
    .map(({ modelSet, ...row }) => ({ ...row, models: Array.from(modelSet).sort((a, b) => a.localeCompare(b)) }))
    .sort((a, b) => b.totals.totalCost - a.totals.totalCost || b.totals.totalTokens - a.totals.totalTokens)
}

function getSessionContextLimit(
  entry: SessionUsageEntry,
  sessionsByKey: ReadonlyMap<string, GatewaySessionRow>,
  sessionsById: ReadonlyMap<string, GatewaySessionRow>,
  defaultContextTokens: number | null,
): number | null {
  const storeSession = sessionsByKey.get(entry.key) ?? (entry.sessionId ? sessionsById.get(entry.sessionId) : undefined)
  return storeSession?.contextTokens ?? defaultContextTokens
}

export function resolveContextPercent(totalTokens: number, contextLimit: number | null): number | null {
  if (!contextLimit || contextLimit <= 0) return null
  return (totalTokens / contextLimit) * 100
}

export function buildSessionContextPercent(
  entry: SessionUsageEntry,
  sessionsByKey: ReadonlyMap<string, GatewaySessionRow>,
  sessionsById: ReadonlyMap<string, GatewaySessionRow>,
  defaults: GatewaySessionsDefaults | null,
): { contextLimit: number | null; contextPercent: number | null } {
  const contextLimit = getSessionContextLimit(entry, sessionsByKey, sessionsById, defaults?.contextTokens ?? null)
  const contextPercent = resolveContextPercent(entry.usage?.totalTokens ?? 0, contextLimit)
  return { contextLimit, contextPercent }
}

export function getUsageLabel(entry: SessionUsageEntry): string {
  return entry.label?.trim() || entry.sessionId || entry.key
}
