import { AlertCircle, Calendar, Timer } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { formatRelative } from '@/lib/cron'
import type { CronJob, CronStatus } from '@/lib/gateway/types'
import { cn } from '@/lib/utils'

type Props = {
  status: CronStatus | null
  jobs: CronJob[]
  total: number
}

export function CronStatsBar({ status, jobs, total }: Props) {
  const enabledCount = jobs.filter((j) => j.enabled).length
  const failingCount = jobs.filter((j) => j.state?.lastStatus === 'error').length

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {/* Scheduler status */}
      <div className="rounded-xl border border-border/40 bg-card p-4">
        <p className="text-xs text-muted-foreground mb-1">Scheduler</p>
        <div className="flex items-center gap-2">
          <div
            className={cn(
              'h-2.5 w-2.5 rounded-full',
              status?.enabled ? 'bg-green-500 shadow-sm shadow-green-500/50 animate-pulse' : 'bg-muted-foreground/30',
            )}
          />
          <span className="text-sm font-semibold">{status ? (status.enabled ? 'Active' : 'Paused') : '…'}</span>
        </div>
      </div>

      {/* Total jobs */}
      <div className="rounded-xl border border-border/40 bg-card p-4">
        <p className="text-xs text-muted-foreground mb-1">Total Jobs</p>
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground/60" />
          <span className="text-lg font-bold">{total}</span>
          <span className="text-xs text-muted-foreground">{enabledCount} enabled</span>
        </div>
      </div>

      {/* Failing */}
      <div
        className={cn(
          'rounded-xl border p-4',
          failingCount > 0 ? 'border-red-500/20 bg-red-500/5' : 'border-border/40 bg-card',
        )}
      >
        <p className="text-xs text-muted-foreground mb-1">Failing</p>
        <div className="flex items-center gap-2">
          {failingCount > 0 ? (
            <>
              <AlertCircle className="h-4 w-4 text-red-500" />
              <span className="text-lg font-bold text-red-600 dark:text-red-400">{failingCount}</span>
              <Badge variant="destructive" className="text-[10px]">
                needs attention
              </Badge>
            </>
          ) : (
            <>
              <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">0</span>
              <span className="text-xs text-muted-foreground">all healthy</span>
            </>
          )}
        </div>
      </div>

      {/* Next wake */}
      <div className="rounded-xl border border-border/40 bg-card p-4">
        <p className="text-xs text-muted-foreground mb-1">Next Wake</p>
        <div className="flex items-center gap-2">
          <Timer className="h-4 w-4 text-muted-foreground/60" />
          <span className="text-sm font-semibold">{formatRelative(status?.nextWakeAtMs)}</span>
        </div>
      </div>
    </div>
  )
}
