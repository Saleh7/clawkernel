import { useVirtualizer } from '@tanstack/react-virtual'
import { AlertCircle, Clock, Copy, MessageSquare, Wrench } from 'lucide-react'
import { useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatTokens } from '@/lib/format'
import type { UsageSessionRow, UsageSessionSort, UsageTimeZone } from '../types'
import { formatCost, formatDurationCompact, formatUsageDateTime } from '../utils'

type UsageSessionTableProps = Readonly<{
  onSelectSession: (key: string) => void
  onSortChange: (value: UsageSessionSort) => void
  rows: UsageSessionRow[]
  selectedSessionKey: string | null
  sort: UsageSessionSort
  timeZone: UsageTimeZone
}>

function StatChip({
  icon,
  value,
  muted,
}: Readonly<{ icon: React.ReactNode; value: string | number; muted?: boolean }>) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] tabular-nums ${muted ? 'text-muted-foreground/60' : 'text-muted-foreground'}`}
    >
      {icon}
      {value}
    </span>
  )
}

function Tag({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <span className="inline-flex max-w-[140px] truncate rounded-md bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground">
      {children}
    </span>
  )
}

export function UsageSessionTable({
  onSelectSession,
  onSortChange,
  rows,
  selectedSessionKey,
  sort,
  timeZone,
}: UsageSessionTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 100,
    overscan: 10,
  })

  const totalErrors = rows.reduce((sum, row) => sum + row.errorCount, 0)
  const averageTokens =
    rows.length > 0 ? Math.round(rows.reduce((sum, row) => sum + row.totalTokens, 0) / rows.length) : 0

  return (
    <Card className="usage-panel gap-4 border-border/60 py-0 shadow-md">
      <CardHeader className="border-b border-border/50 px-5 py-5">
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <CardTitle className="text-base">Sessions</CardTitle>
              <p className="text-sm text-muted-foreground">
                Filtered sessions in the selected range, ranked by recent activity or spend.
              </p>
            </div>
            <div className="text-right text-sm text-muted-foreground">
              <div>{rows.length} shown</div>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <span className="text-muted-foreground">
                <span className="font-semibold text-foreground">{formatTokens(averageTokens)}</span> avg
              </span>
              <span className="text-muted-foreground">
                <span className="font-semibold text-foreground">{totalErrors.toLocaleString()}</span> errors
              </span>
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="usage-session-sort" className="text-sm text-muted-foreground">
                Sort
              </label>
              <Select value={sort} onValueChange={(value) => onSortChange(value as UsageSessionSort)}>
                <SelectTrigger
                  id="usage-session-sort"
                  className="h-9 w-[140px] rounded-xl border-border/60 bg-background/85 text-sm shadow-none"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recent">Recent</SelectItem>
                  <SelectItem value="tokens">Tokens</SelectItem>
                  <SelectItem value="cost">Cost</SelectItem>
                  <SelectItem value="errors">Errors</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-5 pb-5">
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/60 bg-muted/20 px-4 py-12 text-center text-sm text-muted-foreground">
            No sessions matched the current filters.
          </div>
        ) : (
          <div ref={scrollRef} className="max-h-[760px] overflow-auto">
            <div className="relative" style={{ height: `${virtualizer.getTotalSize()}px` }}>
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const row = rows[virtualRow.index]
                const isSelected = selectedSessionKey === row.key

                return (
                  <div
                    key={row.key}
                    className="absolute left-0 top-0 w-full pb-2"
                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                  >
                    <button
                      type="button"
                      className={`group w-full cursor-pointer rounded-xl border px-3.5 py-3 text-left transition-colors ${isSelected ? 'border-primary/40 bg-primary/5' : 'border-border/50 bg-background/85 hover:border-border hover:bg-muted/15'}`}
                      onClick={() => onSelectSession(row.key)}
                    >
                      {/* Row 1: agent name + tokens/cost */}
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-sm font-medium text-foreground">{row.agentName}</span>
                          <button
                            type="button"
                            className="shrink-0 rounded p-0.5 text-muted-foreground/40 opacity-0 transition-opacity hover:text-muted-foreground group-hover:opacity-100"
                            onClick={(event) => {
                              event.stopPropagation()
                              void navigator.clipboard.writeText(row.key)
                            }}
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                        </div>
                        <div className="flex shrink-0 items-baseline gap-2">
                          <span className="text-sm font-semibold tabular-nums text-foreground">
                            {formatTokens(row.totalTokens)}
                          </span>
                          <span className="text-[11px] tabular-nums text-muted-foreground">{formatCost(row.cost)}</span>
                        </div>
                      </div>

                      {/* Row 2: label + tags */}
                      <div className="mt-1.5 flex items-center justify-between gap-3">
                        <span className="min-w-0 truncate text-xs text-muted-foreground">{row.label}</span>
                        <div className="flex shrink-0 items-center gap-1">
                          <Tag>{row.channel}</Tag>
                          <Tag>{row.modelLabel}</Tag>
                        </div>
                      </div>

                      {/* Row 3: stats + last active */}
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <StatChip icon={<MessageSquare className="h-3 w-3" />} value={row.messageCount} />
                          <StatChip icon={<Wrench className="h-3 w-3" />} value={row.toolCalls} />
                          {row.errorCount > 0 && (
                            <StatChip
                              icon={<AlertCircle className="h-3 w-3 text-destructive/70" />}
                              value={row.errorCount}
                            />
                          )}
                          {row.durationMs != null && row.durationMs > 0 && (
                            <StatChip
                              icon={<Clock className="h-3 w-3" />}
                              value={formatDurationCompact(row.durationMs)}
                              muted
                            />
                          )}
                        </div>
                        <span className="text-[11px] text-muted-foreground/60">
                          {formatUsageDateTime(row.lastActive, timeZone)}
                        </span>
                      </div>
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
