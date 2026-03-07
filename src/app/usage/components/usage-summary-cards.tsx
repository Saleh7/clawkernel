import {
  Activity,
  AlertTriangle,
  Bot,
  Clock3,
  DollarSign,
  Gauge,
  Layers3,
  MessageSquareText,
  Wrench,
} from 'lucide-react'
import type * as React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatTokens } from '@/lib/format'
import type { UsageSummaryStats } from '../types'
import { formatCost, formatDurationCompact, formatLatency, formatPercent } from '../utils'

type UsageSummaryCardsProps = Readonly<{
  stats: UsageSummaryStats
}>

type UsageSummaryCardItem = {
  key: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  sub: (stats: UsageSummaryStats) => string
  tone?: 'success' | 'warning'
  value: (stats: UsageSummaryStats) => string
}

const ITEMS: UsageSummaryCardItem[] = [
  {
    key: 'messages',
    label: 'Messages',
    icon: MessageSquareText,
    value: (stats: UsageSummaryStats) => stats.messages.toLocaleString(),
    sub: (stats: UsageSummaryStats) =>
      `${stats.userMessages.toLocaleString()} user · ${stats.assistantMessages.toLocaleString()} assistant`,
  },
  {
    key: 'tools',
    label: 'Tool Calls',
    icon: Wrench,
    value: (stats: UsageSummaryStats) => stats.toolCalls.toLocaleString(),
    sub: (stats: UsageSummaryStats) => `${stats.uniqueTools.toLocaleString()} tools used`,
  },
  {
    key: 'errors',
    label: 'Errors',
    icon: AlertTriangle,
    value: (stats: UsageSummaryStats) => stats.errors.toLocaleString(),
    sub: (stats: UsageSummaryStats) => `${stats.toolResults.toLocaleString()} tool results`,
    tone: 'warning',
  },
  {
    key: 'avg-tokens',
    label: 'Avg Tokens / Msg',
    icon: Activity,
    value: (stats: UsageSummaryStats) =>
      stats.avgTokensPerMessage === null ? '—' : formatTokens(Math.round(stats.avgTokensPerMessage)),
    sub: () => 'Across all visible messages',
  },
  {
    key: 'avg-cost',
    label: 'Avg Cost / Msg',
    icon: DollarSign,
    value: (stats: UsageSummaryStats) => (stats.avgCostPerMessage === null ? '—' : formatCost(stats.avgCostPerMessage)),
    sub: (stats: UsageSummaryStats) => `${formatCost(stats.totals.totalCost)} total`,
  },
  {
    key: 'sessions',
    label: 'Sessions',
    icon: Layers3,
    value: (stats: UsageSummaryStats) => stats.sessionCount.toLocaleString(),
    sub: (stats: UsageSummaryStats) => `${stats.activeAgents.toLocaleString()} agents active`,
  },
  {
    key: 'throughput',
    label: 'Throughput',
    icon: Gauge,
    value: (stats: UsageSummaryStats) =>
      stats.throughputTokensPerMinute === null
        ? '—'
        : `${formatTokens(Math.round(stats.throughputTokensPerMinute))} tok/min`,
    sub: (stats: UsageSummaryStats) => `${formatDurationCompact(stats.avgDurationMs)} avg session`,
  },
  {
    key: 'error-rate',
    label: 'Error Rate',
    icon: Bot,
    value: (stats: UsageSummaryStats) => formatPercent(stats.errorRate),
    sub: (stats: UsageSummaryStats) =>
      `${stats.errors.toLocaleString()} errors across ${stats.messages.toLocaleString()} msgs`,
    tone: 'warning',
  },
  {
    key: 'cache-hit',
    label: 'Cache Hit Rate',
    icon: Clock3,
    value: (stats: UsageSummaryStats) => formatPercent(stats.cacheHitRate),
    sub: (stats: UsageSummaryStats) =>
      `${formatTokens(stats.totals.cacheRead)} cached · ${formatTokens(stats.promptTokens)} prompt`,
    tone: 'success',
  },
] as const

export function UsageSummaryCards({ stats }: UsageSummaryCardsProps) {
  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold tracking-tight sm:text-base">Usage Overview</h2>
        <p className="text-xs text-muted-foreground">
          Session volume, cost signals, and operational quality at a glance.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
        {ITEMS.map((item) => (
          <Card key={item.key} className="usage-metric-card gap-3 border-border/60 py-4 shadow-sm">
            <CardHeader className="px-4 pb-0">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-xs font-medium text-muted-foreground">{item.label}</CardTitle>
                <div
                  className={[
                    'rounded-xl border p-2',
                    item.tone === 'warning' && 'border-warning/20 bg-warning/10 text-warning',
                    item.tone === 'success' && 'border-success/20 bg-success/10 text-success',
                    !item.tone && 'border-border/60 bg-background/80 text-primary',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <item.icon className="h-4 w-4" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-1 px-4">
              <div className="text-2xl font-semibold tracking-tight">{item.value(stats)}</div>
              <p className="text-xs text-muted-foreground">{item.sub(stats)}</p>
              {item.key === 'cache-hit' && stats.avgLatencyMs !== null ? (
                <p className="text-[11px] text-muted-foreground/80">Latency {formatLatency(stats.avgLatencyMs)}</p>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  )
}
