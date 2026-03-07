import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatTokens } from '@/lib/format'
import type { UsageChartMode, UsageInsightRow } from '../types'
import { formatCost, formatPercent, formatShortDate } from '../utils'

type UsageInsightsProps = Readonly<{
  agents: UsageInsightRow[]
  channels: UsageInsightRow[]
  chartMode: UsageChartMode
  models: UsageInsightRow[]
  peakErrorDays: UsageInsightRow[]
  providers: UsageInsightRow[]
  tools: UsageInsightRow[]
}>

type InsightCardProps = Readonly<{
  chartMode: UsageChartMode
  emptyLabel: string
  rows: UsageInsightRow[]
  title: string
  valueFormatter?: (row: UsageInsightRow, chartMode: UsageChartMode) => string
  subFormatter?: (row: UsageInsightRow, chartMode: UsageChartMode) => string
}>

function formatDefaultValue(row: UsageInsightRow, chartMode: UsageChartMode): string {
  return chartMode === 'cost' ? formatCost(row.cost) : formatTokens(row.tokens)
}

function formatDefaultSub(row: UsageInsightRow, chartMode: UsageChartMode): string {
  return chartMode === 'cost'
    ? `${formatTokens(row.tokens)} · ${row.count.toLocaleString()} events`
    : `${formatCost(row.cost)} · ${row.count.toLocaleString()} events`
}

function formatToolValue(row: UsageInsightRow): string {
  return `${row.count.toLocaleString()} calls`
}

function formatToolSub(row: UsageInsightRow): string {
  return row.count === 1 ? 'Single invocation' : 'Across visible sessions'
}

function formatPeakErrorValue(row: UsageInsightRow): string {
  return formatPercent(row.cost > 0 ? row.count / row.cost : null)
}

function formatPeakErrorSub(row: UsageInsightRow): string {
  return `${row.count.toLocaleString()} errors · ${row.cost.toLocaleString()} msgs · ${formatTokens(row.tokens)}`
}

function InsightCard({
  chartMode,
  emptyLabel,
  rows,
  title,
  subFormatter = formatDefaultSub,
  valueFormatter = formatDefaultValue,
}: InsightCardProps) {
  return (
    <Card className="usage-panel gap-4 border-border/60 py-0 shadow-md">
      <CardHeader className="border-b border-border/50 px-5 py-5">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        {rows.length === 0 ? (
          <div className="py-8 text-sm text-muted-foreground">{emptyLabel}</div>
        ) : (
          <div className="space-y-4">
            {rows.slice(0, 3).map((row) => (
              <div key={`${title}-${row.key}`} className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="truncate font-medium text-foreground">
                    {title === 'Peak Error Days' ? formatShortDate(row.label) : row.label}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {title === 'Peak Error Days' ? row.label : (row.secondary ?? subFormatter(row, chartMode))}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-foreground">{valueFormatter(row, chartMode)}</div>
                  {title === 'Peak Error Days' ? (
                    <div className="text-xs text-muted-foreground">{subFormatter(row, chartMode)}</div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function UsageInsights({
  agents,
  channels,
  chartMode,
  models,
  peakErrorDays,
  providers,
  tools,
}: UsageInsightsProps) {
  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold tracking-tight sm:text-base">Top Drivers</h2>
        <p className="text-xs text-muted-foreground">
          The biggest contributors to spend, activity, and operational risk in the visible slice.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <InsightCard title="Top Models" rows={models} chartMode={chartMode} emptyLabel="No model usage in range." />
        <InsightCard
          title="Top Providers"
          rows={providers}
          chartMode={chartMode}
          emptyLabel="No provider usage in range."
        />
        <InsightCard
          title="Top Tools"
          rows={tools}
          chartMode={chartMode}
          emptyLabel="No tool calls in range."
          valueFormatter={(row) => formatToolValue(row)}
          subFormatter={(row) => formatToolSub(row)}
        />
        <InsightCard title="Top Agents" rows={agents} chartMode={chartMode} emptyLabel="No agent activity in range." />
        <InsightCard
          title="Top Channels"
          rows={channels}
          chartMode={chartMode}
          emptyLabel="No channel activity in range."
        />
        <InsightCard
          title="Peak Error Days"
          rows={peakErrorDays}
          chartMode={chartMode}
          emptyLabel="No error activity in range."
          valueFormatter={(row) => formatPeakErrorValue(row)}
          subFormatter={(row) => formatPeakErrorSub(row)}
        />
      </div>
    </section>
  )
}
