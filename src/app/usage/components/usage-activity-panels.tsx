import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatTokens } from '@/lib/format'
import type { CostUsageTotals, UsageActivityHeatmap, UsageChartMode, UsageDailyPoint, UsageTimeZone } from '../types'
import { formatCost, formatShortDate, formatUsageModeLabel } from '../utils'

type UsageActivityPanelsProps = Readonly<{
  chartMode: UsageChartMode
  dailyPoints: UsageDailyPoint[]
  heatmap: UsageActivityHeatmap
  timeZone: UsageTimeZone
  totals: CostUsageTotals
}>

function getHeatClass(intensity: number): string {
  if (intensity >= 0.85) return 'border-primary/30 bg-primary/65 text-primary-foreground'
  if (intensity >= 0.55) return 'border-primary/25 bg-primary/35 text-foreground'
  if (intensity >= 0.25) return 'border-primary/20 bg-primary/15 text-foreground'
  if (intensity > 0) return 'border-primary/15 bg-primary/5 text-muted-foreground'
  return 'border-border/60 bg-background/70 text-muted-foreground'
}

function buildBreakdownRows(totals: CostUsageTotals) {
  return [
    { key: 'output', label: 'Output', value: totals.output, className: 'bg-rose-400' },
    { key: 'input', label: 'Input', value: totals.input, className: 'bg-amber-500' },
    { key: 'cache-write', label: 'Cache Write', value: totals.cacheWrite, className: 'bg-emerald-500' },
    { key: 'cache-read', label: 'Cache Read', value: totals.cacheRead, className: 'bg-cyan-500' },
  ].filter((row) => row.value > 0)
}

export function UsageActivityPanels({ chartMode, dailyPoints, heatmap, timeZone, totals }: UsageActivityPanelsProps) {
  const chartValues = dailyPoints.map((point) => (chartMode === 'cost' ? point.cost : point.tokens))
  const maxChartValue = Math.max(...chartValues, chartMode === 'cost' ? 0.0001 : 1)
  const breakdownRows = buildBreakdownRows(totals)

  return (
    <div className="grid gap-6">
      <Card className="usage-panel gap-4 border-border/60 py-0 shadow-md">
        <CardHeader className="border-b border-border/50 px-5 py-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-1">
              <CardTitle className="text-base">Activity by Time</CardTitle>
              <p className="text-sm text-muted-foreground">
                Token density by last observed activity. Time zone: {timeZone === 'utc' ? 'UTC' : 'Local'}.
              </p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-semibold tracking-tight">
                {chartMode === 'cost' ? formatCost(totals.totalCost) : `${formatTokens(totals.totalTokens)} tokens`}
              </div>
              <p className="text-xs text-muted-foreground">Across visible sessions</p>
            </div>
          </div>
        </CardHeader>

        <CardContent className="grid gap-4 px-5 pb-5 xl:grid-cols-[460px_minmax(0,1fr)]">
          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Day of Week</p>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
              {heatmap.weekdays.map((bucket) => (
                <div
                  key={`weekday-${bucket.label}`}
                  className={`rounded-xl border px-2.5 py-2 transition-colors ${getHeatClass(bucket.intensity)}`}
                  title={`${bucket.label}: ${formatTokens(bucket.tokens)} tokens across ${bucket.sessions} sessions`}
                >
                  <div className="text-xs font-medium">{bucket.label}</div>
                  <div className="mt-1 text-sm font-semibold">
                    {bucket.tokens > 0 ? formatTokens(bucket.tokens) : '0'}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Hours</p>
              <span className="text-xs text-muted-foreground">0 → 23</span>
            </div>
            <div className="grid grid-cols-6 gap-2 sm:grid-cols-8 lg:grid-cols-12 2xl:grid-cols-24">
              {heatmap.hours.map((bucket) => (
                <div
                  key={`hour-${bucket.label}`}
                  className="space-y-1.5"
                  title={`${bucket.label}:00 · ${formatTokens(bucket.tokens)} tokens`}
                >
                  <div className={`h-8 rounded-lg border transition-colors ${getHeatClass(bucket.intensity)}`} />
                  <div className="text-center text-[11px] text-muted-foreground">{bucket.label}</div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="h-3 w-3 rounded border border-primary/15 bg-primary/5" />
              <span>Low</span>
              <div className="h-3 w-3 rounded border border-primary/30 bg-primary/65" />
              <span>High {formatUsageModeLabel(chartMode).toLowerCase()} density</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="usage-panel gap-4 border-border/60 py-0 shadow-md">
          <CardHeader className="border-b border-border/50 px-5 py-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base">Daily Usage</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Daily {formatUsageModeLabel(chartMode).toLowerCase()} trend across the selected window.
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            {dailyPoints.length === 0 ? (
              <div className="flex h-[240px] items-center justify-center rounded-2xl border border-dashed border-border/60 bg-muted/20 text-sm text-muted-foreground">
                No data in the selected range.
              </div>
            ) : (
              <div className="flex h-[240px] items-end gap-2 overflow-x-auto pb-2">
                {dailyPoints.map((point) => {
                  const value = chartMode === 'cost' ? point.cost : point.tokens
                  const height = Math.max((value / maxChartValue) * 100, value > 0 ? 8 : 0)

                  return (
                    <div key={point.date} className="flex min-w-10 flex-1 flex-col items-center gap-2">
                      <div className="text-[11px] text-muted-foreground">
                        {chartMode === 'cost' ? formatCost(point.cost) : formatTokens(point.tokens)}
                      </div>
                      <div className="relative flex h-40 w-full items-end rounded-2xl bg-muted/25 px-1.5 pb-1.5">
                        <div
                          className="w-full rounded-xl bg-linear-to-b from-primary/60 to-primary"
                          style={{ height: `${height}%` }}
                          title={`${point.date}: ${chartMode === 'cost' ? formatCost(point.cost) : formatTokens(point.tokens)}`}
                        />
                      </div>
                      <div className="text-[11px] text-muted-foreground">{formatShortDate(point.date)}</div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="usage-panel gap-4 border-border/60 py-0 shadow-md">
          <CardHeader className="border-b border-border/50 px-5 py-5">
            <CardTitle className="text-base">Tokens by Type</CardTitle>
            <p className="text-sm text-muted-foreground">
              Prompt, generation, and cache distribution for visible sessions.
            </p>
          </CardHeader>
          <CardContent className="space-y-5 px-5 pb-5">
            {breakdownRows.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/60 bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">
                No token data available.
              </div>
            ) : (
              <>
                <div className="overflow-hidden rounded-2xl border border-border/60 bg-muted/25">
                  <div className="flex h-7 w-full">
                    {breakdownRows.map((row) => (
                      <div
                        key={row.key}
                        className={row.className}
                        style={{ width: `${(row.value / totals.totalTokens) * 100}%` }}
                        title={`${row.label}: ${formatTokens(row.value)}`}
                      />
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap gap-4 text-xs">
                  {breakdownRows.map((row) => (
                    <div key={`legend-${row.key}`} className="flex items-center gap-2">
                      <div className={`h-3 w-3 rounded-sm ${row.className}`} />
                      <span className="text-muted-foreground">
                        {row.label} <span className="text-foreground">{formatTokens(row.value)}</span>
                      </span>
                    </div>
                  ))}
                </div>

                <div className="text-sm text-muted-foreground">Total: {formatTokens(totals.totalTokens)}</div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
