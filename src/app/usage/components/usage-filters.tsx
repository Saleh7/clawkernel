import { CalendarDays, Download, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatTokens } from '@/lib/format'
import type { CostUsageTotals, UsageChartMode, UsageClientFilters, UsageFacetOptions, UsageTimeZone } from '../types'
import { formatCost } from '../utils'

type UsageFiltersProps = Readonly<{
  activePreset: 'today' | '7d' | '30d' | null
  chartMode: UsageChartMode
  endDate: string
  filters: UsageClientFilters
  loading: boolean
  options: UsageFacetOptions
  rangeSessionCount: number
  startDate: string
  timeZone: UsageTimeZone
  totals: CostUsageTotals
  visibleSessionCount: number
  onChartModeChange: (mode: UsageChartMode) => void
  onEndDateChange: (value: string) => void
  onExport: () => void
  onFilterChange: <K extends keyof UsageClientFilters>(key: K, value: UsageClientFilters[K]) => void
  onPresetChange: (preset: 'today' | '7d' | '30d') => void
  onQueryChange: (value: string) => void
  onRefresh: () => void
  onStartDateChange: (value: string) => void
  onTimeZoneChange: (value: UsageTimeZone) => void
}>

type FacetSelectProps = Readonly<{
  label: string
  options: UsageFacetOptions[keyof UsageFacetOptions]
  value: string
  onValueChange: (value: string) => void
}>

function FacetSelect({ label, options, value, onValueChange }: FacetSelectProps) {
  return (
    <div className="min-w-0">
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="h-9 min-w-[120px] rounded-xl border-border/60 bg-background/80 text-xs shadow-none">
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">{label}</SelectItem>
          {options.map((option) => (
            <SelectItem key={`${label}-${option.value}`} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export function UsageFilters({
  activePreset,
  chartMode,
  endDate,
  filters,
  loading,
  options,
  rangeSessionCount,
  startDate,
  timeZone,
  totals,
  visibleSessionCount,
  onChartModeChange,
  onEndDateChange,
  onExport,
  onFilterChange,
  onPresetChange,
  onQueryChange,
  onRefresh,
  onStartDateChange,
  onTimeZoneChange,
}: UsageFiltersProps) {
  return (
    <Card className="usage-panel gap-4 border-border/60 py-0 shadow-md">
      <CardHeader className="border-b border-border/50 px-5 py-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-1.5">
            <CardTitle className="text-base">Filters</CardTitle>
            <p className="text-sm text-muted-foreground">
              See where tokens go, when sessions spike, and what drives cost.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/80 px-3 py-1 text-xs">
              <span className="font-semibold text-foreground">{formatTokens(totals.totalTokens)}</span>
              <span className="text-muted-foreground">tokens</span>
            </div>
            <div className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/80 px-3 py-1 text-xs">
              <span className="font-semibold text-foreground">{formatCost(totals.totalCost)}</span>
              <span className="text-muted-foreground">cost</span>
            </div>
            <div className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/80 px-3 py-1 text-xs">
              <span className="font-semibold text-foreground">{visibleSessionCount}</span>
              <span className="text-muted-foreground">sessions</span>
            </div>
            <Button size="sm" variant="outline" className="rounded-xl border-border/60" onClick={onExport}>
              <Download className="h-3.5 w-3.5" />
              Export
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 px-5 pb-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                ['today', 'Today'],
                ['7d', '7d'],
                ['30d', '30d'],
              ] as const
            ).map(([preset, label]) => (
              <Button
                key={preset}
                size="xs"
                variant={activePreset === preset ? 'default' : 'outline'}
                className="rounded-lg border-border/60"
                onClick={() => onPresetChange(preset)}
              >
                {label}
              </Button>
            ))}

            <label htmlFor="usage-start-date" className="sr-only">
              Start date
            </label>
            <Input
              id="usage-start-date"
              type="date"
              value={startDate}
              onChange={(event) => onStartDateChange(event.target.value)}
              className="h-10 w-[154px] rounded-xl border-border/60 bg-background/90 shadow-none"
            />

            <span className="text-sm text-muted-foreground">to</span>

            <label htmlFor="usage-end-date" className="sr-only">
              End date
            </label>
            <Input
              id="usage-end-date"
              type="date"
              value={endDate}
              onChange={(event) => onEndDateChange(event.target.value)}
              className="h-10 w-[154px] rounded-xl border-border/60 bg-background/90 shadow-none"
            />

            <Select value={timeZone} onValueChange={(value) => onTimeZoneChange(value as UsageTimeZone)}>
              <SelectTrigger className="h-10 w-[104px] rounded-xl border-border/60 bg-background/90 shadow-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="local">Local</SelectItem>
                <SelectItem value="utc">UTC</SelectItem>
              </SelectContent>
            </Select>

            <div className="inline-flex rounded-xl border border-border/60 bg-background/90 p-1">
              <Button
                size="sm"
                variant={chartMode === 'tokens' ? 'default' : 'ghost'}
                className="h-8 rounded-lg px-3 text-xs"
                onClick={() => onChartModeChange('tokens')}
              >
                Tokens
              </Button>
              <Button
                size="sm"
                variant={chartMode === 'cost' ? 'default' : 'ghost'}
                className="h-8 rounded-lg px-3 text-xs"
                onClick={() => onChartModeChange('cost')}
              >
                Cost
              </Button>
            </div>

            <Button size="sm" className="rounded-full px-4" onClick={onRefresh} disabled={loading}>
              <RefreshCw className={loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
              Refresh
            </Button>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" />
            <span>{rangeSessionCount} sessions in range</span>
          </div>
        </div>

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_280px]">
          <Input
            value={filters.query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Filter sessions, agents, providers, models, channels, or tools"
            className="h-11 rounded-xl border-border/60 bg-background/85 shadow-none"
          />

          <div className="flex items-center justify-between rounded-xl border border-dashed border-border/60 bg-muted/20 px-4 text-xs text-muted-foreground">
            <span>Client-side filters</span>
            <span>{visibleSessionCount} visible</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <FacetSelect
            label="Agent"
            options={options.agents}
            value={filters.agentId}
            onValueChange={(value) => onFilterChange('agentId', value)}
          />
          <FacetSelect
            label="Channel"
            options={options.channels}
            value={filters.channel}
            onValueChange={(value) => onFilterChange('channel', value)}
          />
          <FacetSelect
            label="Provider"
            options={options.providers}
            value={filters.provider}
            onValueChange={(value) => onFilterChange('provider', value)}
          />
          <FacetSelect
            label="Model"
            options={options.models}
            value={filters.model}
            onValueChange={(value) => onFilterChange('model', value)}
          />
          <FacetSelect
            label="Tool"
            options={options.tools}
            value={filters.tool}
            onValueChange={(value) => onFilterChange('tool', value)}
          />
          <span className="ml-auto text-xs text-muted-foreground">
            Tip: combine query and facet filters for narrower slices.
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
