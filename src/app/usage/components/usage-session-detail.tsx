import { ChevronDown, ChevronUp, Clock3, MessageSquareText, Search, TriangleAlert, Wrench, X } from 'lucide-react'
import { useCallback, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { formatTokens } from '@/lib/format'
import type {
  SessionContextWeight,
  SessionLogEntry,
  SessionLogRole,
  SessionUsageEntry,
  SessionUsageTimeSeries,
  UsageTimeZone,
} from '../types'
import { formatCost, formatDurationCompact, formatUsageDateTime } from '../utils'

type UsageSessionDetailProps = Readonly<{
  agentName?: string
  session: SessionUsageEntry
  timeSeries: SessionUsageTimeSeries | null
  timeSeriesLoading: boolean
  logs: SessionLogEntry[] | null
  logsLoading: boolean
  timeZone: UsageTimeZone
  onClose: () => void
}>

const CHARS_PER_TOKEN = 4

function charsToTokens(chars: number): number {
  return Math.round(chars / CHARS_PER_TOKEN)
}

function pct(part: number, total: number): string {
  if (!total || total <= 0) return '0'
  return ((part / total) * 100).toFixed(1)
}
function DetailBadges({ session }: Readonly<{ session: SessionUsageEntry }>) {
  const badges: string[] = []
  if (session.channel) badges.push(`channel:${session.channel}`)
  if (session.agentId) badges.push(`agent:${session.agentId}`)
  if (session.modelProvider || session.providerOverride)
    badges.push(`provider:${session.modelProvider ?? session.providerOverride}`)
  if (session.model) badges.push(`model:${session.model}`)
  if (badges.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2">
      {badges.map((badge) => (
        <span
          key={badge}
          className="rounded-full border border-border/60 bg-muted/30 px-3 py-1 text-xs text-muted-foreground"
        >
          {badge}
        </span>
      ))}
    </div>
  )
}

function SummaryCards({ session }: Readonly<{ session: SessionUsageEntry }>) {
  const usage = session.usage
  if (!usage) return null

  const formatTs = (ts?: number): string => (ts ? new Date(ts).toLocaleString() : '—')

  const cards = [
    {
      key: 'messages',
      icon: MessageSquareText,
      title: 'Messages',
      value: (usage.messageCounts?.total ?? 0).toLocaleString(),
      sub: `${usage.messageCounts?.user ?? 0} user · ${usage.messageCounts?.assistant ?? 0} assistant`,
    },
    {
      key: 'tools',
      icon: Wrench,
      title: 'Tool Calls',
      value: (usage.toolUsage?.totalCalls ?? 0).toLocaleString(),
      sub: `${usage.toolUsage?.uniqueTools ?? 0} tools`,
    },
    {
      key: 'errors',
      icon: TriangleAlert,
      title: 'Errors',
      value: (usage.messageCounts?.errors ?? 0).toLocaleString(),
      sub: `${usage.messageCounts?.toolResults ?? 0} tool results`,
    },
    {
      key: 'duration',
      icon: Clock3,
      title: 'Duration',
      value: formatDurationCompact(usage.durationMs ?? null),
      sub: `${formatTs(usage.firstActivity)} → ${formatTs(usage.lastActivity)}`,
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {cards.map((card) => (
        <div key={card.key} className="rounded-2xl border border-border/60 bg-background/85 px-4 py-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <card.icon className="h-3.5 w-3.5" />
            {card.title}
          </div>
          <div className="mt-1 text-xl font-semibold">{card.value}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">{card.sub}</div>
        </div>
      ))}
    </div>
  )
}
type InsightListProps = Readonly<{
  title: string
  items: Array<{ label: string; value: string; sub?: string }>
  emptyLabel: string
}>

function InsightList({ title, items, emptyLabel }: InsightListProps) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background/85 px-5 py-4">
      <div className="text-sm font-semibold">{title}</div>
      {items.length === 0 ? (
        <div className="mt-3 text-xs text-muted-foreground">{emptyLabel}</div>
      ) : (
        <div className="mt-3 space-y-3">
          {items.map((item) => (
            <div key={item.label} className="flex items-center justify-between gap-4">
              <span className="truncate text-sm text-foreground">{item.label}</span>
              <div className="shrink-0 text-right">
                <div className="text-sm font-semibold">{item.value}</div>
                {item.sub && <div className="text-xs text-muted-foreground">{item.sub}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TopInsights({ session }: Readonly<{ session: SessionUsageEntry }>) {
  const usage = session.usage
  if (!usage) return null

  const toolItems = (usage.toolUsage?.tools ?? []).slice(0, 6).map((tool) => ({
    label: tool.name,
    value: `${tool.count}`,
    sub: 'calls',
  }))

  const modelItems = (usage.modelUsage ?? []).slice(0, 6).map((entry) => ({
    label: entry.model ?? 'unknown',
    value: formatCost(entry.totals.totalCost),
    sub: formatTokens(entry.totals.totalTokens),
  }))

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <InsightList title="Top Tools" items={toolItems} emptyLabel="No tool calls" />
      <InsightList title="Model Mix" items={modelItems} emptyLabel="No model data" />
    </div>
  )
}
type TimeSeriesChartProps = Readonly<{
  timeSeries: SessionUsageTimeSeries | null
  loading: boolean
}>

function TimeSeriesChart({ timeSeries, loading }: TimeSeriesChartProps) {
  const [mode, setMode] = useState<'per-turn' | 'cumulative'>('per-turn')
  const [breakdown, setBreakdown] = useState<'total' | 'by-type'>('by-type')

  if (loading) {
    return <Skeleton className="h-[320px] rounded-2xl" />
  }

  if (!timeSeries || timeSeries.points.length < 2) {
    return (
      <div className="rounded-2xl border border-dashed border-border/60 bg-muted/20 px-4 py-12 text-center text-sm text-muted-foreground">
        No timeline data available.
      </div>
    )
  }

  const isCumulative = mode === 'cumulative'
  const breakdownByType = !isCumulative && breakdown === 'by-type'
  const points = timeSeries.points

  let cumTokens = 0
  let cumCost = 0
  let sumOutput = 0
  let sumInput = 0
  let sumCacheRead = 0
  let sumCacheWrite = 0
  const enriched = points.map((p) => {
    cumTokens += p.totalTokens
    cumCost += p.cost
    sumOutput += p.output
    sumInput += p.input
    sumCacheRead += p.cacheRead
    sumCacheWrite += p.cacheWrite
    return { ...p, cumTokens, cumCost }
  })

  const barValues = enriched.map((p) => (isCumulative ? p.cumTokens : p.totalTokens))
  const maxValue = Math.max(...barValues, 1)
  const totalTypeTokens = sumOutput + sumInput + sumCacheRead + sumCacheWrite

  return (
    <div className="rounded-2xl border border-border/60 bg-background/85 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-semibold">Usage Over Time</div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-xl border border-border/60 bg-background/90 p-0.5">
            <Button
              size="xs"
              variant={isCumulative ? 'ghost' : 'default'}
              className="h-7 rounded-lg px-2.5 text-xs"
              onClick={() => setMode('per-turn')}
            >
              Per Turn
            </Button>
            <Button
              size="xs"
              variant={isCumulative ? 'default' : 'ghost'}
              className="h-7 rounded-lg px-2.5 text-xs"
              onClick={() => setMode('cumulative')}
            >
              Cumulative
            </Button>
          </div>
          {!isCumulative && (
            <div className="inline-flex rounded-xl border border-border/60 bg-background/90 p-0.5">
              <Button
                size="xs"
                variant={breakdown === 'total' ? 'default' : 'ghost'}
                className="h-7 rounded-lg px-2.5 text-xs"
                onClick={() => setBreakdown('total')}
              >
                Total
              </Button>
              <Button
                size="xs"
                variant={breakdown === 'by-type' ? 'default' : 'ghost'}
                className="h-7 rounded-lg px-2.5 text-xs"
                onClick={() => setBreakdown('by-type')}
              >
                By Type
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 flex h-[200px] gap-px overflow-x-auto">
        {enriched.map((p, i) => {
          const val = barValues[i]
          const height = Math.max((val / maxValue) * 100, val > 0 ? 2 : 0)

          if (!breakdownByType) {
            return (
              <div
                key={p.timestamp}
                className="flex min-w-1 flex-1 flex-col justify-end"
                title={`${new Date(p.timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} · ${formatTokens(val)}`}
              >
                <div className="w-full rounded-t-sm bg-primary" style={{ height: `${height}%` }} />
              </div>
            )
          }

          const total = p.output + p.input + p.cacheRead + p.cacheWrite
          const outputH = total > 0 ? (p.output / total) * height : 0
          const inputH = total > 0 ? (p.input / total) * height : 0
          const cacheWriteH = total > 0 ? (p.cacheWrite / total) * height : 0
          const cacheReadH = total > 0 ? (p.cacheRead / total) * height : 0

          return (
            <div
              key={p.timestamp}
              className="flex min-w-1 flex-1 flex-col justify-end"
              title={`${new Date(p.timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} · Out ${formatTokens(p.output)} · In ${formatTokens(p.input)} · CW ${formatTokens(p.cacheWrite)} · CR ${formatTokens(p.cacheRead)}`}
            >
              <div className="w-full rounded-t-sm bg-cyan-500" style={{ height: `${cacheReadH}%` }} />
              <div className="w-full bg-emerald-500" style={{ height: `${cacheWriteH}%` }} />
              <div className="w-full bg-amber-500" style={{ height: `${inputH}%` }} />
              <div className="w-full bg-rose-400" style={{ height: `${outputH}%` }} />
            </div>
          )
        })}
      </div>

      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {new Date(points[0].timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
        </span>
        <span>
          {points.length} msgs · {formatTokens(cumTokens)} · {formatCost(cumCost)}
        </span>
        <span>
          {new Date(points.at(-1)!.timestamp).toLocaleTimeString(undefined, {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>

      {breakdownByType && (
        <div className="mt-4 space-y-2">
          <div className="text-xs font-medium">Tokens by Type</div>
          <div className="flex h-5 w-full overflow-hidden rounded-full">
            <div className="bg-rose-400" style={{ width: `${pct(sumOutput, totalTypeTokens)}%` }} />
            <div className="bg-amber-500" style={{ width: `${pct(sumInput, totalTypeTokens)}%` }} />
            <div className="bg-emerald-500" style={{ width: `${pct(sumCacheWrite, totalTypeTokens)}%` }} />
            <div className="bg-cyan-500" style={{ width: `${pct(sumCacheRead, totalTypeTokens)}%` }} />
          </div>
          <div className="flex flex-wrap gap-4 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-rose-400" />
              Output {formatTokens(sumOutput)}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-500" />
              Input {formatTokens(sumInput)}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500" />
              Cache Write {formatTokens(sumCacheWrite)}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-cyan-500" />
              Cache Read {formatTokens(sumCacheRead)}
            </span>
          </div>
          <div className="text-xs text-muted-foreground">Total: {formatTokens(totalTypeTokens)}</div>
        </div>
      )}
    </div>
  )
}
const ALL_ROLES: SessionLogRole[] = ['user', 'assistant', 'tool', 'toolResult']
const ROLE_LABELS: Record<SessionLogRole, string> = {
  user: 'You',
  assistant: 'Assistant',
  tool: 'Tool',
  toolResult: 'Tool result',
}
const ROLE_COLORS: Record<SessionLogRole, string> = {
  user: 'border-l-blue-400',
  assistant: 'border-l-emerald-400',
  tool: 'border-l-amber-400',
  toolResult: 'border-l-purple-400',
}

function ConversationLogs({
  logs,
  loading,
  timeZone,
}: Readonly<{
  logs: SessionLogEntry[] | null
  loading: boolean
  timeZone: UsageTimeZone
}>) {
  const [expandedAll, setExpandedAll] = useState(false)
  const [filterRoles, setFilterRoles] = useState<Set<SessionLogRole>>(new Set())
  const [filterQuery, setFilterQuery] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  const normalizedQuery = filterQuery.trim().toLowerCase()

  const filtered = useMemo(() => {
    if (!logs) return []
    return logs
      .map((log, originalIndex) => ({ log, originalIndex }))
      .filter(({ log }) => {
        if (filterRoles.size > 0 && !filterRoles.has(log.role)) return false
        if (normalizedQuery && !log.content.toLowerCase().includes(normalizedQuery)) return false
        return true
      })
  }, [filterRoles, logs, normalizedQuery])

  const toggleRole = useCallback((role: SessionLogRole) => {
    setFilterRoles((prev) => {
      const next = new Set(prev)
      if (next.has(role)) next.delete(role)
      else next.add(role)
      return next
    })
  }, [])

  const clearFilters = useCallback(() => {
    setFilterRoles(new Set())
    setFilterQuery('')
  }, [])

  if (loading) {
    return <Skeleton className="h-[400px] rounded-2xl" />
  }

  if (!logs || logs.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border/60 bg-muted/20 px-4 py-12 text-center text-sm text-muted-foreground">
        No conversation data available.
      </div>
    )
  }

  const hasFilters = filterRoles.size > 0 || normalizedQuery.length > 0
  const displayCount = hasFilters ? `${filtered.length} of ${logs.length}` : `${logs.length}`

  return (
    <div className="rounded-2xl border border-border/60 bg-background/85">
      <div className="flex items-center justify-between border-b border-border/50 px-5 py-4">
        <div className="text-sm font-semibold">
          Conversation <span className="font-normal text-muted-foreground">({displayCount} messages)</span>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="rounded-xl border-border/60 text-xs"
          onClick={() => setExpandedAll((prev) => !prev)}
        >
          {expandedAll ? 'Collapse All' : 'Expand All'}
        </Button>
      </div>

      <div className="space-y-3 border-b border-border/50 px-5 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {ALL_ROLES.map((role) => (
            <Button
              key={role}
              size="xs"
              variant={filterRoles.has(role) ? 'default' : 'outline'}
              className="h-7 rounded-lg border-border/60 px-2.5 text-xs"
              onClick={() => toggleRole(role)}
            >
              {ROLE_LABELS[role]}
            </Button>
          ))}
          <div className="relative ml-auto flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filterQuery}
              onChange={(event) => setFilterQuery(event.target.value)}
              placeholder="Search conversation"
              className="h-8 rounded-xl border-border/60 bg-background/90 pl-9 text-xs shadow-none"
            />
          </div>
          {hasFilters && (
            <Button
              size="xs"
              variant="outline"
              className="h-7 rounded-lg border-border/60 text-xs"
              onClick={clearFilters}
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      <div ref={listRef} className="max-h-[600px] divide-y divide-border/30 overflow-auto">
        {filtered.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">No messages match the filters.</div>
        ) : (
          filtered.map(({ log, originalIndex }) => (
            <LogEntry key={`${log.timestamp}-${originalIndex}`} log={log} expanded={expandedAll} timeZone={timeZone} />
          ))
        )}
      </div>
    </div>
  )
}

function LogEntry({
  log,
  expanded,
  timeZone,
}: Readonly<{ log: SessionLogEntry; expanded: boolean; timeZone: UsageTimeZone }>) {
  const [isOpen, setIsOpen] = useState(false)
  const showDetails = expanded || isOpen

  const contentPreview = log.content.length > 500 && !showDetails ? `${log.content.slice(0, 500)}…` : log.content

  return (
    <div className={`border-l-2 ${ROLE_COLORS[log.role]} px-5 py-3`}>
      <div className="flex items-center gap-3 text-xs">
        <span className="rounded-md border border-border/60 bg-muted/30 px-2 py-0.5 font-medium uppercase">
          {ROLE_LABELS[log.role]}
        </span>
        <span className="text-muted-foreground">{formatUsageDateTime(log.timestamp, timeZone)}</span>
        {log.tokens != null && log.tokens > 0 && (
          <span className="text-muted-foreground">{formatTokens(log.tokens)}</span>
        )}
      </div>
      <div className="mt-2 whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground/90">
        {contentPreview}
      </div>
      {log.content.length > 500 && (
        <button
          type="button"
          className="mt-1 flex items-center gap-1 text-xs text-primary hover:underline"
          onClick={() => setIsOpen((prev) => !prev)}
        >
          {showDetails ? (
            <>
              <ChevronUp className="h-3 w-3" /> Show less
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3" /> Show more
            </>
          )}
        </button>
      )}
    </div>
  )
}
function ContextBreakdown({
  contextWeight,
  usage,
}: Readonly<{
  contextWeight?: SessionContextWeight | null
  usage?: SessionUsageEntry['usage']
}>) {
  const [expanded, setExpanded] = useState(false)

  if (!contextWeight) {
    return (
      <div className="rounded-2xl border border-dashed border-border/60 bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
        No context data available.
      </div>
    )
  }

  const systemTokens = charsToTokens(contextWeight.systemPrompt?.chars ?? 0)
  const skillsTokens = charsToTokens(contextWeight.skills?.promptChars ?? 0)
  const toolsTokens = charsToTokens((contextWeight.tools?.listChars ?? 0) + (contextWeight.tools?.schemaChars ?? 0))
  const filesTokens = charsToTokens(
    (contextWeight.injectedWorkspaceFiles ?? []).reduce((sum, f) => sum + f.injectedChars, 0),
  )
  const totalContextTokens = systemTokens + skillsTokens + toolsTokens + filesTokens

  let contextPct = ''
  if (usage && usage.totalTokens > 0) {
    const inputTokens = usage.input + usage.cacheRead
    if (inputTokens > 0) {
      contextPct = `~${Math.min((totalContextTokens / inputTokens) * 100, 100).toFixed(0)}% of input`
    }
  }

  const skillsList = [...(contextWeight.skills?.entries ?? [])].sort((a, b) => b.blockChars - a.blockChars)
  const toolsList = [...(contextWeight.tools?.entries ?? [])].sort(
    (a, b) => b.summaryChars + b.schemaChars - (a.summaryChars + a.schemaChars),
  )
  const filesList = [...(contextWeight.injectedWorkspaceFiles ?? [])].sort((a, b) => b.injectedChars - a.injectedChars)

  const limit = 4
  const showAll = expanded
  const skillsTop = showAll ? skillsList : skillsList.slice(0, limit)
  const toolsTop = showAll ? toolsList : toolsList.slice(0, limit)
  const filesTop = showAll ? filesList : filesList.slice(0, limit)
  const hasMore = skillsList.length > limit || toolsList.length > limit || filesList.length > limit

  return (
    <div className="rounded-2xl border border-border/60 bg-background/85 p-5">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">System Prompt Breakdown</div>
        {hasMore && (
          <Button
            size="xs"
            variant="outline"
            className="h-7 rounded-lg border-border/60 text-xs"
            onClick={() => setExpanded((prev) => !prev)}
          >
            {showAll ? 'Collapse' : 'Expand all'}
          </Button>
        )}
      </div>

      <div className="mt-2 text-xs text-muted-foreground">{contextPct || 'Base context per message'}</div>

      <div className="mt-3 flex h-5 w-full overflow-hidden rounded-full">
        <div className="bg-rose-400" style={{ width: `${pct(systemTokens, totalContextTokens)}%` }} />
        <div className="bg-blue-400" style={{ width: `${pct(skillsTokens, totalContextTokens)}%` }} />
        <div className="bg-purple-400" style={{ width: `${pct(toolsTokens, totalContextTokens)}%` }} />
        <div className="bg-amber-400" style={{ width: `${pct(filesTokens, totalContextTokens)}%` }} />
      </div>

      <div className="mt-2 flex flex-wrap gap-4 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-rose-400" />
          Sys ~{formatTokens(systemTokens)}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-blue-400" />
          Skills ~{formatTokens(skillsTokens)}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-purple-400" />
          Tools ~{formatTokens(toolsTokens)}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-400" />
          Files ~{formatTokens(filesTokens)}
        </span>
      </div>

      <div className="mt-1 text-xs text-muted-foreground">Total: ~{formatTokens(totalContextTokens)}</div>

      {(skillsList.length > 0 || toolsList.length > 0 || filesList.length > 0) && (
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {skillsList.length > 0 && (
            <ContextCard
              title={`Skills (${skillsList.length})`}
              items={skillsTop.map((s) => ({ name: s.name, tokens: charsToTokens(s.blockChars) }))}
              moreCount={skillsList.length - skillsTop.length}
            />
          )}
          {toolsList.length > 0 && (
            <ContextCard
              title={`Tools (${toolsList.length})`}
              items={toolsTop.map((t) => ({
                name: t.name,
                tokens: charsToTokens(t.summaryChars + t.schemaChars),
              }))}
              moreCount={toolsList.length - toolsTop.length}
            />
          )}
          {filesList.length > 0 && (
            <ContextCard
              title={`Files (${filesList.length})`}
              items={filesTop.map((f) => ({ name: f.name, tokens: charsToTokens(f.injectedChars) }))}
              moreCount={filesList.length - filesTop.length}
            />
          )}
        </div>
      )}
    </div>
  )
}

function ContextCard({
  title,
  items,
  moreCount,
}: Readonly<{
  title: string
  items: Array<{ name: string; tokens: number }>
  moreCount: number
}>) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/10 px-4 py-3">
      <div className="text-xs font-semibold">{title}</div>
      <div className="mt-2 space-y-1.5">
        {items.map((item) => (
          <div key={item.name} className="flex items-center justify-between gap-2 text-xs">
            <span className="truncate font-mono text-foreground/80">{item.name}</span>
            <span className="shrink-0 text-muted-foreground">~{formatTokens(item.tokens)}</span>
          </div>
        ))}
      </div>
      {moreCount > 0 && <div className="mt-2 text-xs text-muted-foreground">+{moreCount} more</div>}
    </div>
  )
}
export function UsageSessionDetail({
  agentName,
  session,
  timeSeries,
  timeSeriesLoading,
  logs,
  logsLoading,
  timeZone,
  onClose,
}: UsageSessionDetailProps) {
  const usage = session.usage
  const label = session.label || session.key
  const displayLabel = label.length > 60 ? `${label.slice(0, 60)}…` : label

  return (
    <Card className="usage-panel gap-0 border-border/60 py-0 shadow-lg">
      <CardHeader className="border-b border-border/50 px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {agentName && <CardTitle className="truncate text-base">{agentName}</CardTitle>}
            <div className="truncate text-sm text-muted-foreground">{displayLabel}</div>
          </div>
          <div className="flex shrink-0 items-center gap-4">
            {usage && (
              <div className="text-right text-sm">
                <span className="font-semibold">{formatTokens(usage.totalTokens)}</span>
                <span className="ml-1 text-muted-foreground">tokens</span>
                <span className="ml-3 font-semibold">{formatCost(usage.totalCost)}</span>
              </div>
            )}
            <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 px-5 py-5">
        <DetailBadges session={session} />
        <SummaryCards session={session} />
        <TopInsights session={session} />
        <TimeSeriesChart timeSeries={timeSeries} loading={timeSeriesLoading} />
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <ConversationLogs logs={logs} loading={logsLoading} timeZone={timeZone} />
          <ContextBreakdown contextWeight={session.contextWeight} usage={usage} />
        </div>
      </CardContent>
    </Card>
  )
}
