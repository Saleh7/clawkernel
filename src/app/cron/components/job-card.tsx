import {
  AlertTriangle,
  Bot,
  Calendar,
  ChevronDown,
  ChevronRight,
  FileText,
  Globe,
  Hash,
  Pencil,
  Play,
  Power,
  PowerOff,
  RotateCw,
  Send,
  Timer,
  Trash2,
  Zap,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { describeDelivery, formatDate, formatDuration, formatRelative, formatSchedule } from '@/lib/cron'
import type { GatewayClient } from '@/lib/gateway/client'
import type { CronJob, CronRunLogEntry } from '@/lib/gateway/types'
import { createLogger } from '@/lib/logger'
import { cn } from '@/lib/utils'
import { FailureGuideCard } from './failure-guide'
import { RunHistory } from './run-history'

const log = createLogger('cron:card')

type Props = {
  job: CronJob
  client: GatewayClient | null
  is24h: boolean
  expanded: boolean
  runs: CronRunLogEntry[]
  runsTotal: number
  runsHasMore: boolean
  runsLoading: boolean
  runsLoadingMore: boolean
  focused?: boolean
  onToggleExpand: () => void
  onEdit: () => void
  onDelete: () => void
  onRefreshRuns: () => void
  onLoadMoreRuns: () => void
  onRefreshJobs: () => void
}

export function JobCard({
  job,
  client,
  is24h,
  expanded,
  runs,
  runsTotal,
  runsHasMore,
  runsLoading,
  runsLoadingMore,
  focused,
  onToggleExpand,
  onEdit,
  onDelete,
  onRefreshRuns,
  onLoadMoreRuns,
  onRefreshJobs,
}: Props) {
  const [toggling, setToggling] = useState(false)
  const [running, setRunning] = useState(false)

  const sched = formatSchedule(job.schedule, is24h)
  const st = job.state
  const hasError = st?.lastStatus === 'error'
  const isRunning = !!st?.runningAtMs
  const delivery = describeDelivery(job)

  const handleToggle = async () => {
    if (!client) return
    setToggling(true)
    try {
      await client.request('cron.update', { id: job.id, patch: { enabled: !job.enabled } })
      onRefreshJobs()
    } catch (err) {
      log.warn('Toggle failed', err)
      toast.error('Failed to toggle job')
    }
    setToggling(false)
  }

  const handleRunNow = async () => {
    if (!client) return
    setRunning(true)
    try {
      await client.request('cron.run', { id: job.id, mode: 'force' })
      toast.success('Job triggered')
      setTimeout(onRefreshJobs, 3000)
    } catch (err) {
      log.warn('Run failed', err)
      toast.error('Failed to run job')
    }
    setRunning(false)
  }

  return (
    <div
      id={`cron-job-${job.id}`}
      className={cn(
        'rounded-2xl border transition-all',
        hasError ? 'border-red-500/25' : 'border-border/40',
        expanded && 'shadow-lg shadow-black/5',
        focused && 'ring-2 ring-primary/30',
        !job.enabled && 'opacity-55',
      )}
    >
      {/* Clickable header */}
      <button type="button" className="w-full text-left p-5" onClick={onToggleExpand}>
        <div className="flex items-start gap-4">
          {/* Status column */}
          <div className="mt-1.5 flex flex-col items-center gap-2">
            <div
              className={cn(
                'h-4 w-4 rounded-full',
                !job.enabled
                  ? 'bg-muted-foreground/20'
                  : isRunning
                    ? 'bg-blue-500 animate-pulse shadow-md shadow-blue-500/40'
                    : hasError
                      ? 'bg-red-500 shadow-md shadow-red-500/40'
                      : st?.lastStatus === 'ok'
                        ? 'bg-emerald-500 shadow-md shadow-emerald-500/30'
                        : 'bg-muted-foreground/30',
              )}
            />
            {expanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground/50" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground/30" />
            )}
          </div>

          {/* Main content */}
          <div className="min-w-0 flex-1 space-y-2">
            {/* Row 1: Name + badges */}
            <div className="flex items-center gap-3 flex-wrap">
              <h3 className="text-lg font-bold leading-tight">{job.name}</h3>
              {job.description && (
                <span className="text-sm text-muted-foreground truncate max-w-xs">{job.description}</span>
              )}
              {!job.enabled && (
                <Badge variant="secondary" className="text-xs">
                  Disabled
                </Badge>
              )}
              {isRunning && (
                <Badge className="gap-1.5 bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/20">
                  <RotateCw className="h-3 w-3 animate-spin" />
                  Running
                </Badge>
              )}
              {delivery.hasIssue && (
                <Badge variant="outline" className="gap-1.5 text-amber-600 dark:text-amber-400 border-amber-500/30">
                  <AlertTriangle className="h-3 w-3" />
                  No target
                </Badge>
              )}
              {job.deleteAfterRun && <Badge variant="secondary">One-shot</Badge>}
            </div>

            {/* Row 2: Metadata */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4 shrink-0" />
                {sched.label}
              </span>
              <span className="flex items-center gap-1.5">
                <Bot className="h-4 w-4 shrink-0" />
                {job.agentId ?? 'default'}
              </span>
              {job.payload.kind === 'agentTurn' && job.payload.model && (
                <span className="flex items-center gap-1.5 font-mono text-xs">
                  <Globe className="h-4 w-4 shrink-0" />
                  {job.payload.model}
                </span>
              )}
              {st?.nextRunAtMs && job.enabled && (
                <span className="flex items-center gap-1.5">
                  <Timer className="h-4 w-4 shrink-0" />
                  Next: <strong className="text-foreground">{formatRelative(st.nextRunAtMs)}</strong>
                </span>
              )}
              {st?.lastStatus && (
                <span
                  className={cn(
                    'flex items-center gap-1.5 font-medium',
                    hasError
                      ? 'text-red-600 dark:text-red-400'
                      : st.lastStatus === 'ok'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : '',
                  )}
                >
                  <Zap className="h-4 w-4 shrink-0" />
                  {st.lastStatus === 'ok' ? 'Passed' : st.lastStatus === 'error' ? 'Failed' : 'Skipped'}
                  {st.lastDurationMs != null && (
                    <span className="font-normal text-muted-foreground">({formatDuration(st.lastDurationMs)})</span>
                  )}
                </span>
              )}
            </div>
          </div>

          {/* Quick actions */}
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation wrapper */}
          {/* biome-ignore lint/a11y/noStaticElementInteractions: stopPropagation wrapper */}
          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              disabled={toggling}
              onClick={handleToggle}
              title={job.enabled ? 'Disable' : 'Enable'}
            >
              {job.enabled ? (
                <Power className="h-[18px] w-[18px] text-emerald-500" />
              ) : (
                <PowerOff className="h-[18px] w-[18px] text-muted-foreground/40" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              disabled={running}
              onClick={handleRunNow}
              title="Run now"
            >
              {running ? (
                <RotateCw className="h-[18px] w-[18px] animate-spin" />
              ) : (
                <Play className="h-[18px] w-[18px]" />
              )}
            </Button>
            <Button variant="ghost" size="icon" className="h-9 w-9" onClick={onEdit} title="Edit">
              <Pencil className="h-[18px] w-[18px]" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-destructive/70 hover:text-destructive"
              onClick={onDelete}
              title="Delete"
            >
              <Trash2 className="h-[18px] w-[18px]" />
            </Button>
          </div>
        </div>
      </button>

      {/* Compact failure guide (collapsed) */}
      {hasError && st?.lastError && !expanded && (
        <div className="mx-5 mb-4">
          <FailureGuideCard
            error={st.lastError}
            delivery={job.delivery}
            consecutiveErrors={st.consecutiveErrors}
            onFix={onEdit}
            compact
          />
        </div>
      )}

      {/* Expanded detail view */}
      {expanded && (
        <div className="border-t border-border/30 p-5 space-y-6">
          {/* Full failure guide */}
          {hasError && st?.lastError && (
            <FailureGuideCard
              error={st.lastError}
              delivery={job.delivery}
              consecutiveErrors={st.consecutiveErrors}
              onFix={onEdit}
            />
          )}

          {/* Execution Tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <ExecTile
              label="Last Run"
              value={formatRelative(st?.lastRunAtMs)}
              sub={formatDate(st?.lastRunAtMs, is24h)}
            />
            <ExecTile
              label="Next Run"
              value={formatRelative(st?.nextRunAtMs)}
              sub={formatDate(st?.nextRunAtMs, is24h)}
            />
            <ExecTile label="Duration" value={formatDuration(st?.lastDurationMs)} />
            <ExecTile
              label="Status"
              value={st?.lastStatus ?? '—'}
              className={cn(hasError && 'border-red-500/20 bg-red-500/5')}
              valueClassName={cn(
                hasError
                  ? 'text-red-600 dark:text-red-300'
                  : st?.lastStatus === 'ok'
                    ? 'text-emerald-600 dark:text-emerald-300'
                    : undefined,
              )}
              sub={hasError && st?.consecutiveErrors ? `${st.consecutiveErrors} consecutive errors` : undefined}
            />
          </div>

          <Separator className="opacity-30" />

          {/* Configuration */}
          <div>
            <h4 className="mb-3 text-sm font-semibold flex items-center gap-2 text-muted-foreground">
              <Hash className="h-4 w-4" />
              Configuration
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 rounded-xl border border-border/30 bg-muted/20 p-4">
              <ConfigRow label="Job ID" value={job.id} mono />
              <ConfigRow label="Agent" value={job.agentId ?? 'default'} />
              <ConfigRow label="Schedule" value={sched.label} />
              <ConfigRow label="Session" value={`${job.sessionTarget} · wake ${job.wakeMode}`} />
              {job.payload.kind === 'agentTurn' && job.payload.model && (
                <ConfigRow label="Model" value={job.payload.model} mono />
              )}
              <ConfigRow label="Created" value={formatDate(job.createdAtMs, is24h)} />
              <ConfigRow label="Updated" value={formatDate(job.updatedAtMs, is24h)} />
            </div>
          </div>

          {/* Delivery */}
          <div>
            <h4 className="mb-3 text-sm font-semibold flex items-center gap-2 text-muted-foreground">
              <Send className="h-4 w-4" />
              Delivery
            </h4>
            <div
              className={cn(
                'rounded-xl border p-4',
                delivery.hasIssue ? 'border-amber-500/25 bg-amber-500/5' : 'border-border/30 bg-muted/20',
              )}
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-xs text-muted-foreground">Mode</span>
                  <p className="mt-1 font-medium capitalize">{job.delivery?.mode ?? 'none'}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Channel</span>
                  <p className="mt-1">{job.delivery?.channel ?? '—'}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Recipient</span>
                  <p
                    className={cn('mt-1 font-mono text-xs', !job.delivery?.to && 'text-amber-600 dark:text-amber-400')}
                  >
                    {job.delivery?.to ?? '⚠ Not set'}
                  </p>
                </div>
              </div>
              {delivery.hasIssue && delivery.issue && (
                <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2.5">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <p className="text-sm text-amber-700 dark:text-amber-300 flex-1">{delivery.issue}</p>
                  <Button size="sm" variant="outline" onClick={onEdit} className="shrink-0">
                    Fix delivery
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Prompt Preview */}
          {job.payload.kind === 'agentTurn' && job.payload.message && (
            <div>
              <h4 className="mb-3 text-sm font-semibold flex items-center gap-2 text-muted-foreground">
                <FileText className="h-4 w-4" />
                Prompt
              </h4>
              <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-xl border border-border/30 bg-muted/20 p-4 text-sm leading-6">
                {job.payload.message}
              </pre>
            </div>
          )}
          {job.payload.kind === 'systemEvent' && (
            <div>
              <h4 className="mb-3 text-sm font-semibold flex items-center gap-2 text-muted-foreground">
                <FileText className="h-4 w-4" />
                Event Text
              </h4>
              <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-xl border border-border/30 bg-muted/20 p-4 text-sm leading-6">
                {job.payload.text}
              </pre>
            </div>
          )}

          <Separator className="opacity-30" />

          {/* Run History */}
          <RunHistory
            runs={runs}
            total={runsTotal}
            hasMore={runsHasMore}
            loading={runsLoading}
            loadingMore={runsLoadingMore}
            is24h={is24h}
            onRefresh={onRefreshRuns}
            onLoadMore={onLoadMoreRuns}
          />
        </div>
      )}
    </div>
  )
}

// -- Internal helpers -------------------------------------------------------

function ConfigRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={cn('text-sm truncate text-right', mono && 'font-mono text-xs')}>{value}</span>
    </div>
  )
}

function ExecTile({
  label,
  value,
  sub,
  className,
  valueClassName,
}: {
  label: string
  value: string
  sub?: string
  className?: string
  valueClassName?: string
}) {
  return (
    <div className={cn('rounded-xl border border-border/30 bg-muted/20 p-4 text-center', className)}>
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={cn('text-base font-bold', valueClassName)}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground/70">{sub}</p>}
    </div>
  )
}
