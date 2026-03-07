import { AlertTriangle, BarChart3 } from 'lucide-react'
import { startTransition, useCallback, useDeferredValue, useMemo, useRef, useState } from 'react'
import { resolveAgentName } from '@/app/agents/utils'
import { PageHeader } from '@/components/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { selectAgents, selectClient, selectIsConnected, selectSessions, useGatewayStore } from '@/stores/gateway-store'
import {
  buildAgentInsights,
  buildChannelInsights,
  buildModelInsights,
  buildPeakErrorDayInsights,
  buildProviderInsights,
  buildToolInsights,
  buildUsageActivityHeatmap,
  buildUsageDailyPoints,
  buildUsageFacetOptions,
  buildUsageOverviewStats,
  filterUsageSessions,
  getUsageAgentKey,
  getUsageChannelLabel,
  getUsageModelLabel,
  getUsageProviderLabel,
  sortUsageSessionRows,
  USAGE_FILTER_ALL,
} from './analytics'
import { UsageActivityPanels } from './components/usage-activity-panels'
import { UsageAgentTable } from './components/usage-agent-table'
import { UsageFilters } from './components/usage-filters'
import { UsageInsights } from './components/usage-insights'
import { UsageModelTable } from './components/usage-model-table'
import { UsageSessionDetail } from './components/usage-session-detail'
import { UsageSessionTable } from './components/usage-session-table'
import { UsageSummaryCards } from './components/usage-summary-cards'
import type {
  CostUsageSummary,
  SessionLogEntry,
  SessionsUsageResult,
  SessionUsageTimeSeries,
  UsageChartMode,
  UsageClientFilters,
  UsageSessionRow,
  UsageSessionSort,
  UsageTimeZone,
} from './types'
import {
  buildAgentRows,
  buildDateInterpretationParams,
  buildModelRows,
  buildSessionContextPercent,
  formatCost,
  getDefaultUsageDateRange,
  getSessionLastActivity,
  getStoredGatewayCompatibilityKey,
  getUsageLabel,
  getUsagePresetRange,
  getUsageRangePreset,
  isLegacyDateInterpretationUnsupportedError,
  rememberLegacyDateInterpretation,
  shouldSendLegacyDateInterpretation,
  toErrorMessage,
} from './utils'

const DEFAULT_FILTERS: UsageClientFilters = {
  query: '',
  agentId: USAGE_FILTER_ALL,
  channel: USAGE_FILTER_ALL,
  provider: USAGE_FILTER_ALL,
  model: USAGE_FILTER_ALL,
  tool: USAGE_FILTER_ALL,
}

function UsageSkeleton() {
  return (
    <div className="usage-shell relative flex flex-col gap-6 p-6">
      <div className="usage-grid-mask" />
      <div className="relative z-10 flex flex-col gap-6">
        <PageHeader icon={BarChart3} title="Usage" description="Loading usage analytics from the gateway" />
        <Skeleton className="h-[196px] rounded-[1.5rem]" />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
          {Array.from({ length: 9 }, (_unused, index) => `usage-skeleton-${index + 1}`).map((id) => (
            <Skeleton key={id} className="h-32 rounded-2xl" />
          ))}
        </div>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_420px]">
          <Skeleton className="h-[760px] rounded-[1.5rem]" />
          <Skeleton className="h-[760px] rounded-[1.5rem]" />
        </div>
      </div>
    </div>
  )
}

export default function UsagePage() {
  const client = useGatewayStore(selectClient)
  const connected = useGatewayStore(selectIsConnected)
  const agents = useGatewayStore(selectAgents)
  const storeSessions = useGatewayStore(selectSessions)
  const sessionsDefaults = useGatewayStore((state) => state.sessionsDefaults)

  const [timeZone, setTimeZone] = useState<UsageTimeZone>('local')
  const [chartMode, setChartMode] = useState<UsageChartMode>('tokens')
  const [sessionSort, setSessionSort] = useState<UsageSessionSort>('recent')
  const [usageResult, setUsageResult] = useState<SessionsUsageResult | null>(null)
  const [costSummary, setCostSummary] = useState<CostUsageSummary | null>(null)
  const [filters, setFilters] = useState<UsageClientFilters>(DEFAULT_FILTERS)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedSessionKey, setSelectedSessionKey] = useState<string | null>(null)
  const [sessionTimeSeries, setSessionTimeSeries] = useState<SessionUsageTimeSeries | null>(null)
  const [sessionTimeSeriesLoading, setSessionTimeSeriesLoading] = useState(false)
  const [sessionLogs, setSessionLogs] = useState<SessionLogEntry[] | null>(null)
  const [sessionLogsLoading, setSessionLogsLoading] = useState(false)
  const requestIdRef = useRef(0)
  const sessionDetailRequestIdRef = useRef(0)
  const gatewayCompatibilityKey = useMemo(() => getStoredGatewayCompatibilityKey(), [])
  const { startDate: defaultStartDate, endDate: defaultEndDate } = useMemo(() => getDefaultUsageDateRange(), [])
  const [startDate, setStartDate] = useState(defaultStartDate)
  const [endDate, setEndDate] = useState(defaultEndDate)
  const deferredQuery = useDeferredValue(filters.query)

  const fetchUsage = useCallback(async () => {
    if (!client?.connected) return
    if (startDate > endDate) {
      setError('Start date must be earlier than or equal to end date.')
      return
    }

    const requestId = ++requestIdRef.current
    setLoading(true)
    setError(null)

    const runRequests = async (includeDateInterpretation: boolean) => {
      const dateInterpretation = buildDateInterpretationParams(timeZone, includeDateInterpretation)
      return await Promise.all([
        client.request<SessionsUsageResult>('sessions.usage', {
          startDate,
          endDate,
          ...dateInterpretation,
          limit: 1000,
          includeContextWeight: true,
        }),
        client.request<CostUsageSummary>('usage.cost', {
          startDate,
          endDate,
          ...dateInterpretation,
        }),
      ])
    }

    try {
      const includeDateInterpretation = shouldSendLegacyDateInterpretation(gatewayCompatibilityKey)
      let nextUsageResult: SessionsUsageResult
      let nextCostSummary: CostUsageSummary

      try {
        ;[nextUsageResult, nextCostSummary] = await runRequests(includeDateInterpretation)
      } catch (err) {
        if (includeDateInterpretation && isLegacyDateInterpretationUnsupportedError(err)) {
          rememberLegacyDateInterpretation(gatewayCompatibilityKey)
          ;[nextUsageResult, nextCostSummary] = await runRequests(false)
        } else {
          throw err
        }
      }

      if (requestId !== requestIdRef.current) return
      setUsageResult(nextUsageResult)
      setCostSummary(nextCostSummary)
    } catch (err) {
      if (requestId !== requestIdRef.current) return
      setError(toErrorMessage(err))
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false)
      }
    }
  }, [client, endDate, gatewayCompatibilityKey, startDate, timeZone])

  const fetchSessionDetail = useCallback(
    async (sessionKey: string) => {
      if (!client?.connected) return
      const detailRequestId = ++sessionDetailRequestIdRef.current
      setSessionTimeSeriesLoading(true)
      setSessionLogsLoading(true)
      setSessionTimeSeries(null)
      setSessionLogs(null)

      try {
        const tsResult = await client.request<SessionUsageTimeSeries>('sessions.usage.timeseries', {
          key: sessionKey,
          maxPoints: 200,
        })
        if (detailRequestId === sessionDetailRequestIdRef.current) {
          setSessionTimeSeries(tsResult)
        }
      } catch {
        if (detailRequestId === sessionDetailRequestIdRef.current) {
          setSessionTimeSeries(null)
        }
      } finally {
        if (detailRequestId === sessionDetailRequestIdRef.current) {
          setSessionTimeSeriesLoading(false)
        }
      }

      try {
        const logsResult = await client.request<{ logs: SessionLogEntry[] }>('sessions.usage.logs', {
          key: sessionKey,
          limit: 1000,
        })
        if (detailRequestId === sessionDetailRequestIdRef.current) {
          setSessionLogs(logsResult.logs)
        }
      } catch {
        if (detailRequestId === sessionDetailRequestIdRef.current) {
          setSessionLogs(null)
        }
      } finally {
        if (detailRequestId === sessionDetailRequestIdRef.current) {
          setSessionLogsLoading(false)
        }
      }
    },
    [client],
  )

  const handleSelectSession = useCallback(
    (key: string) => {
      if (selectedSessionKey === key) {
        setSelectedSessionKey(null)
        setSessionTimeSeries(null)
        setSessionLogs(null)
        return
      }
      setSelectedSessionKey(key)
      void fetchSessionDetail(key)
    },
    [fetchSessionDetail, selectedSessionKey],
  )

  const handleCloseSessionDetail = useCallback(() => {
    setSelectedSessionKey(null)
    setSessionTimeSeries(null)
    setSessionLogs(null)
  }, [])

  const [hasFetched, setHasFetched] = useState(false)
  const handleRefresh = useCallback(async () => {
    setHasFetched(true)
    await fetchUsage()
  }, [fetchUsage])

  const agentNameById = useMemo(
    () => new Map((agents?.agents ?? []).map((agent) => [agent.id, resolveAgentName(agent)])),
    [agents?.agents],
  )
  const storeSessionsByKey = useMemo(
    () => new Map(storeSessions.map((session) => [session.key, session])),
    [storeSessions],
  )
  const storeSessionsById = useMemo(
    () => new Map(storeSessions.filter((session) => session.sessionId).map((session) => [session.sessionId!, session])),
    [storeSessions],
  )

  const rangeSessions = usageResult?.sessions ?? []
  const activePreset = useMemo(() => getUsageRangePreset(startDate, endDate), [endDate, startDate])
  const deferredFilters = useMemo(() => ({ ...filters, query: deferredQuery }), [deferredQuery, filters])
  const visibleSessions = useMemo(
    () => filterUsageSessions(rangeSessions, deferredFilters, agentNameById),
    [agentNameById, deferredFilters, rangeSessions],
  )
  const overviewStats = useMemo(() => buildUsageOverviewStats(visibleSessions), [visibleSessions])
  const filterOptions = useMemo(
    () => buildUsageFacetOptions(rangeSessions, agentNameById),
    [agentNameById, rangeSessions],
  )
  const modelRows = useMemo(() => buildModelRows(visibleSessions), [visibleSessions])
  const agentRows = useMemo(() => buildAgentRows(visibleSessions), [visibleSessions])
  const heatmap = useMemo(() => buildUsageActivityHeatmap(visibleSessions, timeZone), [timeZone, visibleSessions])
  const hasClientFilters = useMemo(
    () =>
      filters.query.trim().length > 0 ||
      filters.agentId !== USAGE_FILTER_ALL ||
      filters.channel !== USAGE_FILTER_ALL ||
      filters.provider !== USAGE_FILTER_ALL ||
      filters.model !== USAGE_FILTER_ALL ||
      filters.tool !== USAGE_FILTER_ALL,
    [filters],
  )
  const dailyPoints = useMemo(
    () => buildUsageDailyPoints(visibleSessions, hasClientFilters ? [] : (costSummary?.daily ?? [])),
    [costSummary?.daily, hasClientFilters, visibleSessions],
  )

  const sessionRows = useMemo(() => {
    const rows: UsageSessionRow[] = visibleSessions.map((entry) => {
      const { contextLimit, contextPercent } = buildSessionContextPercent(
        entry,
        storeSessionsByKey,
        storeSessionsById,
        sessionsDefaults,
      )

      return {
        key: entry.key,
        label: getUsageLabel(entry),
        agentId: getUsageAgentKey(entry),
        agentName: agentNameById.get(getUsageAgentKey(entry)) ?? getUsageAgentKey(entry),
        channel: getUsageChannelLabel(entry),
        providerLabel: getUsageProviderLabel(entry),
        modelLabel: getUsageModelLabel(entry),
        inputTokens: entry.usage?.input ?? 0,
        outputTokens: entry.usage?.output ?? 0,
        cacheTokens: (entry.usage?.cacheRead ?? 0) + (entry.usage?.cacheWrite ?? 0),
        totalTokens: entry.usage?.totalTokens ?? 0,
        cost: entry.usage?.totalCost ?? 0,
        lastActive: getSessionLastActivity(entry),
        durationMs: entry.usage?.durationMs ?? null,
        messageCount: entry.usage?.messageCounts?.total ?? 0,
        errorCount: entry.usage?.messageCounts?.errors ?? 0,
        toolCalls: entry.usage?.toolUsage?.totalCalls ?? 0,
        contextPercent,
        contextLimit,
      }
    })

    return sortUsageSessionRows(rows, sessionSort)
  }, [agentNameById, sessionSort, sessionsDefaults, storeSessionsById, storeSessionsByKey, visibleSessions])

  const modelInsights = useMemo(() => buildModelInsights(visibleSessions), [visibleSessions])
  const providerInsights = useMemo(() => buildProviderInsights(visibleSessions), [visibleSessions])
  const toolInsights = useMemo(() => buildToolInsights(visibleSessions), [visibleSessions])
  const agentInsights = useMemo(
    () => buildAgentInsights(visibleSessions, agentNameById),
    [agentNameById, visibleSessions],
  )
  const channelInsights = useMemo(() => buildChannelInsights(visibleSessions), [visibleSessions])
  const peakErrorDays = useMemo(() => buildPeakErrorDayInsights(visibleSessions), [visibleSessions])
  const selectedSession = useMemo(
    () => (selectedSessionKey ? (rangeSessions.find((s) => s.key === selectedSessionKey) ?? null) : null),
    [rangeSessions, selectedSessionKey],
  )

  const updateFilter = useCallback(<K extends keyof UsageClientFilters>(key: K, value: UsageClientFilters[K]) => {
    startTransition(() => {
      setFilters((current) => ({ ...current, [key]: value }))
    })
  }, [])

  const applyPreset = useCallback((preset: 'today' | '7d' | '30d') => {
    const range = getUsagePresetRange(preset)
    setStartDate(range.startDate)
    setEndDate(range.endDate)
  }, [])

  const exportUsageSnapshot = useCallback(() => {
    const payload = {
      exportedAt: new Date().toISOString(),
      startDate,
      endDate,
      timeZone,
      chartMode,
      filters,
      totals: overviewStats.totals,
      sessions: visibleSessions,
    }

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = globalThis.URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `usage-${startDate}-${endDate}.json`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    setTimeout(() => globalThis.URL.revokeObjectURL(url), 100)
  }, [chartMode, endDate, filters, overviewStats.totals, startDate, timeZone, visibleSessions])

  if (!connected && !usageResult) return <UsageSkeleton />
  if (loading && !hasFetched) return <UsageSkeleton />

  return (
    <div className="usage-shell relative flex flex-col gap-6 p-6">
      <div className="usage-grid-mask" />
      <div className="relative z-10 flex flex-col gap-6">
        <PageHeader
          icon={BarChart3}
          title="Usage"
          description="See where tokens go, when sessions spike, and what drives cost."
        />

        <UsageFilters
          activePreset={activePreset}
          chartMode={chartMode}
          endDate={endDate}
          filters={filters}
          loading={loading}
          options={filterOptions}
          rangeSessionCount={rangeSessions.length}
          startDate={startDate}
          timeZone={timeZone}
          totals={overviewStats.totals}
          visibleSessionCount={visibleSessions.length}
          onChartModeChange={setChartMode}
          onEndDateChange={setEndDate}
          onExport={exportUsageSnapshot}
          onFilterChange={updateFilter}
          onPresetChange={applyPreset}
          onQueryChange={(value) => updateFilter('query', value)}
          onRefresh={() => void handleRefresh()}
          onStartDateChange={setStartDate}
          onTimeZoneChange={setTimeZone}
        />

        {!hasFetched && !usageResult && (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border/60 bg-muted/10 px-6 py-16">
            <BarChart3 className="h-10 w-10 text-muted-foreground/50" />
            <div className="space-y-1 text-center">
              <p className="text-sm font-medium text-foreground">Select a date range and press Refresh</p>
              <p className="text-xs text-muted-foreground">
                Choose your start and end dates above, or use a preset (Today, 7d, 30d), then click Refresh to load
                usage analytics.
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/5 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
            <div>
              <p className="text-xs font-semibold text-red-300">Failed to load usage analytics</p>
              <p className="mt-1 font-mono text-xs text-muted-foreground">{error}</p>
            </div>
          </div>
        )}

        {hasFetched && overviewStats.totals.missingCostEntries > 0 && (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
            <div>
              <p className="text-xs font-semibold text-amber-300">Pricing data is partially incomplete</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {overviewStats.totals.missingCostEntries} usage entries are missing cost metadata in the visible range.
              </p>
            </div>
          </div>
        )}

        {hasFetched && (
          <>
            <UsageSummaryCards stats={overviewStats} />

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_420px]">
              <UsageActivityPanels
                chartMode={chartMode}
                dailyPoints={dailyPoints}
                heatmap={heatmap}
                timeZone={timeZone}
                totals={overviewStats.totals}
              />
              <UsageSessionTable
                rows={sessionRows}
                selectedSessionKey={selectedSessionKey}
                sort={sessionSort}
                timeZone={timeZone}
                onSelectSession={handleSelectSession}
                onSortChange={setSessionSort}
              />
            </div>

            {selectedSession && (
              <UsageSessionDetail
                agentName={agentNameById.get(selectedSession.agentId ?? '') ?? selectedSession.agentId}
                session={selectedSession}
                timeSeries={sessionTimeSeries}
                timeSeriesLoading={sessionTimeSeriesLoading}
                logs={sessionLogs}
                logsLoading={sessionLogsLoading}
                timeZone={timeZone}
                onClose={handleCloseSessionDetail}
              />
            )}

            <UsageInsights
              agents={agentInsights}
              channels={channelInsights}
              chartMode={chartMode}
              models={modelInsights}
              peakErrorDays={peakErrorDays}
              providers={providerInsights}
              tools={toolInsights}
            />

            <div className="space-y-4">
              <div className="space-y-1">
                <h2 className="text-sm font-semibold tracking-tight sm:text-base">Detailed Breakdown</h2>
                <p className="text-xs text-muted-foreground">Tabular cuts for exact model and agent totals.</p>
              </div>
              <div className="grid gap-6 xl:grid-cols-2">
                <UsageModelTable rows={modelRows} />
                <UsageAgentTable rows={agentRows} agentNameById={agentNameById} timeZone={timeZone} />
              </div>
            </div>

            {usageResult && (
              <p className="text-xs text-muted-foreground">
                Range total:{' '}
                <span className="font-medium text-foreground">{formatCost(costSummary?.totals.totalCost ?? 0)}</span>
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
