import { AlertCircle, CheckCircle, Clock, Loader2, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDuration, formatFullDate } from '@/lib/cron'
import type { CronRunLogEntry } from '@/lib/gateway/types'
import { cn } from '@/lib/utils'

type Props = {
  runs: CronRunLogEntry[]
  total: number
  hasMore: boolean
  loading: boolean
  loadingMore: boolean
  is24h: boolean
  onRefresh: () => void
  onLoadMore: () => void
}

function RunCard({ run, is24h }: { run: CronRunLogEntry; is24h: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const isError = run.status === 'error'

  return (
    <div
      className={cn(
        'rounded-lg border px-4 py-3',
        isError ? 'border-red-500/20 bg-red-500/5' : 'border-border/30 bg-muted/30',
      )}
    >
      <div className="flex items-center gap-3">
        {isError ? (
          <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
        ) : (
          <CheckCircle className="h-4 w-4 shrink-0 text-emerald-500" />
        )}
        <span className="text-sm font-medium">{formatFullDate(run.ts, is24h)}</span>
        <span className="text-muted-foreground/30">·</span>
        <span className="text-sm text-muted-foreground">{formatDuration(run.durationMs)}</span>
        {run.model && (
          <>
            <span className="text-muted-foreground/30">·</span>
            <span className="font-mono text-xs text-muted-foreground/70">{run.model}</span>
          </>
        )}
        {run.sessionId && (
          <>
            <span className="text-muted-foreground/30">·</span>
            <span className="font-mono text-xs text-muted-foreground/60">{run.sessionId.slice(0, 8)}</span>
          </>
        )}
        <div className="flex-1" />
        {(run.summary || run.error) && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-xs font-medium text-primary/80 transition-colors hover:text-primary"
          >
            {expanded ? 'Collapse' : 'Details'}
          </button>
        )}
      </div>

      {run.error && (
        <p className="mt-2 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-200">{run.error}</p>
      )}

      {!expanded && run.summary && (
        <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground/85">
          {run.summary.replace(/[*#|_`]/g, '').slice(0, 200)}
        </p>
      )}

      {expanded && (
        <div className="mt-3 space-y-3">
          {run.summary && (
            <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border/20 bg-background/80 p-4 text-sm leading-6">
              {run.summary}
            </pre>
          )}
          {run.sessionKey && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Session:</span>
              <code className="rounded-md bg-muted/60 px-2 py-1 font-mono text-xs">{run.sessionKey}</code>
            </div>
          )}
          {run.deliveryStatus && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Delivery:</span>
              <span
                className={cn(
                  'font-medium',
                  run.deliveryStatus === 'delivered'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-muted-foreground',
                )}
              >
                {run.deliveryStatus}
              </span>
              {run.deliveryError && <span className="text-red-600 dark:text-red-400">({run.deliveryError})</span>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function RunHistory({ runs, total, hasMore, loading, loadingMore, is24h, onRefresh, onLoadMore }: Props) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
          <Clock className="h-4 w-4" />
          Run History
          {total > 0 && <span className="font-normal text-muted-foreground/60">({total})</span>}
        </h4>
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={onRefresh} disabled={loading}>
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {loading && runs.length === 0 && (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      )}

      {!loading && runs.length === 0 && (
        <p className="py-4 text-center text-sm text-muted-foreground/50">No runs recorded yet</p>
      )}

      {runs.length > 0 && (
        <div className="space-y-2">
          {runs.map((run, i) => (
            <RunCard key={`${run.ts}-${run.jobId}-${i}`} run={run} is24h={is24h} />
          ))}
          {hasMore && (
            <Button variant="ghost" className="w-full gap-2" onClick={onLoadMore} disabled={loadingMore}>
              {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Load more runs
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
