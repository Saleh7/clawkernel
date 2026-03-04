// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

import {
  Calendar,
  CheckCircle2,
  Clock,
  Pencil,
  Play,
  Plus,
  Power,
  PowerOff,
  RotateCw,
  Timer,
  Trash2,
  XCircle,
  Zap,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useTimeFormat } from '@/hooks/use-time-format'
import type { GatewayClient } from '@/lib/gateway/client'
import type { CronJob, CronStatus } from '@/lib/gateway/types'
import { createLogger } from '@/lib/logger'
import { cn } from '@/lib/utils'
import { formatDuration, formatRelative, formatSchedule, refreshCron } from '../cron-utils'

const log = createLogger('agents:cron')

import { CreateEditJobDialog } from '../dialogs/create-edit-job-dialog'
import { DeleteJobDialog } from '../dialogs/delete-job-dialog'
import { RunHistoryPanel } from '../dialogs/run-history-panel'
import { AgentTabEmptyState } from './agent-tab-empty-state'

// ---------------------------------------------------------------------------
//  Props
// ---------------------------------------------------------------------------

type Props = {
  readonly agentId: string
  readonly cronJobs: CronJob[]
  readonly cronStatus: CronStatus | null
  readonly client: GatewayClient | null
}

function schedulerStatusLabel(cronStatus: CronStatus | null): string {
  if (!cronStatus) return 'Loading…'
  return cronStatus.enabled ? 'Scheduler Active' : 'Scheduler Inactive'
}

// ---------------------------------------------------------------------------
//  CronJobCard
// ---------------------------------------------------------------------------

function CronJobCard({
  job,
  client,
  is24h,
  onEdit,
  onDelete,
}: {
  readonly job: CronJob
  readonly client: GatewayClient | null
  readonly is24h: boolean
  readonly onEdit: () => void
  readonly onDelete: () => void
}) {
  const sched = formatSchedule(job.schedule, is24h)
  const nextRun = job.state?.nextRunAtMs
  const now = Date.now()
  const timeToNext = nextRun ? nextRun - now : null
  const progressPct =
    timeToNext != null && timeToNext > 0 ? Math.max(0, Math.min(100, 100 - (timeToNext / 3_600_000) * 100)) : 0

  const [toggling, setToggling] = useState(false)
  const [running, setRunning] = useState(false)

  const handleToggle = async () => {
    if (!client) return
    setToggling(true)
    try {
      await client.request('cron.update', { jobId: job.id, patch: { enabled: !job.enabled } })
      await refreshCron(client)
    } catch (err) {
      log.warn('Toggle cron job failed', err)
      toast.error('Failed to toggle cron job')
    }
    setToggling(false)
  }

  const handleRunNow = async () => {
    if (!client) return
    setRunning(true)
    try {
      await client.request('cron.run', { jobId: job.id, mode: 'force' })
    } catch (err) {
      log.warn('Run cron job failed', err)
      toast.error('Failed to run cron job')
    }
    setTimeout(() => setRunning(false), 2000)
  }

  return (
    <div
      className={cn(
        'rounded-2xl border p-5 transition-all duration-200',
        job.enabled ? 'border-border/50 bg-card/80 backdrop-blur-sm' : 'border-border/30 bg-muted/20 opacity-60',
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
              job.enabled ? 'bg-green-500/10' : 'bg-muted/50',
            )}
          >
            {job.enabled ? (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            ) : (
              <XCircle className="h-4 w-4 text-muted-foreground/40" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{job.name}</p>
            {job.description && (
              <p className="text-[10px] text-muted-foreground/50 mt-0.5 truncate">{job.description}</p>
            )}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 shrink-0"
          disabled={toggling}
          onClick={handleToggle}
          title={job.enabled ? 'Disable' : 'Enable'}
        >
          {job.enabled ? (
            <Power className="h-3.5 w-3.5 text-green-500" />
          ) : (
            <PowerOff className="h-3.5 w-3.5 text-muted-foreground/40" />
          )}
        </Button>
      </div>

      {/* Badges */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        <Badge variant="outline" className="font-mono text-[9px] gap-1">
          <Clock className="h-2.5 w-2.5" />
          {sched.label}
        </Badge>
        <Badge variant="outline" className="text-[9px]">
          {sched.kind}
        </Badge>
        <Badge variant="outline" className="text-[9px] gap-1">
          <Play className="h-2 w-2" />
          {job.sessionTarget}
        </Badge>
        <Badge variant="outline" className="text-[9px] gap-1">
          <Zap className="h-2 w-2" />
          {job.wakeMode}
        </Badge>
        {job.deleteAfterRun && (
          <Badge variant="secondary" className="text-[9px]">
            one-shot
          </Badge>
        )}
      </div>

      {/* Next run progress */}
      {nextRun && job.enabled && (
        <div className="mb-3">
          <div className="flex items-center justify-between text-[9px] text-muted-foreground/50 mb-1">
            <span>Next run</span>
            <span>{formatRelative(nextRun)}</span>
          </div>
          <div className="h-1 rounded-full bg-muted/30 overflow-hidden">
            <div
              className="h-full rounded-full bg-primary/40 transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Last run */}
      {job.state?.lastStatus && (
        <div className="flex items-center gap-2 mb-3 pt-2 border-t border-border/20">
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full shrink-0',
              job.state.lastStatus === 'ok' ? 'bg-green-500' : 'bg-destructive',
            )}
          />
          <span className="text-[10px] text-muted-foreground/50">
            Last: {job.state.lastStatus} · {formatRelative(job.state.lastRunAtMs)}
          </span>
          {job.state.lastDurationMs != null && (
            <span className="text-[10px] font-mono text-muted-foreground/30">
              {formatDuration(job.state.lastDurationMs)}
            </span>
          )}
        </div>
      )}

      {/* Run history */}
      <div className="mb-3">
        <RunHistoryPanel jobId={job.id} client={client} />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 pt-2 border-t border-border/20">
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-[10px]" onClick={handleRunNow} disabled={running}>
          {running ? <RotateCw className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
          Run Now
        </Button>
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-[10px]" onClick={onEdit}>
          <Pencil className="h-3 w-3" />
          Edit
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-[10px] text-destructive hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="h-3 w-3" />
          Delete
        </Button>
      </div>
    </div>
  )
}

export function AgentCron({ agentId, cronJobs, cronStatus, client }: Props) {
  const { is24h } = useTimeFormat()
  const jobs = cronJobs.filter((j) => j.agentId === agentId)

  const [createOpen, setCreateOpen] = useState(false)
  const [editJob, setEditJob] = useState<CronJob | null>(null)
  const [deleteJob, setDeleteJob] = useState<CronJob | null>(null)

  return (
    <div className="space-y-6">
      {/* === SCHEDULER STATUS BAR === */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border/50 bg-card/80 backdrop-blur-sm px-5 py-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                'h-2.5 w-2.5 rounded-full',
                cronStatus?.enabled ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground/30',
              )}
            />
            <span className="text-sm font-semibold text-foreground">{schedulerStatusLabel(cronStatus)}</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" />
            <span>
              {jobs.length} agent jobs · {cronStatus?.jobs ?? 0} total
            </span>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Timer className="h-3.5 w-3.5" />
            <span>Next wake: {formatRelative(cronStatus?.nextWakeAtMs)}</span>
          </div>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
          <Plus className="h-3.5 w-3.5" />
          New Job
        </Button>
      </div>

      {/* === JOB CARDS === */}
      {jobs.length === 0 ? (
        <AgentTabEmptyState
          icon={Clock}
          title="No cron jobs for this agent"
          action={
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              Create First Job
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {jobs.map((job) => (
            <CronJobCard
              key={job.id}
              job={job}
              client={client}
              is24h={is24h}
              onEdit={() => setEditJob(job)}
              onDelete={() => setDeleteJob(job)}
            />
          ))}
        </div>
      )}

      {/* === DIALOGS === */}
      <CreateEditJobDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        client={client}
        agentId={agentId}
        editJob={null}
      />
      <CreateEditJobDialog
        open={editJob !== null}
        onOpenChange={(v) => {
          if (!v) setEditJob(null)
        }}
        client={client}
        agentId={agentId}
        editJob={editJob}
      />
      <DeleteJobDialog
        job={deleteJob}
        open={deleteJob !== null}
        onOpenChange={(v) => {
          if (!v) setDeleteJob(null)
        }}
        client={client}
      />
    </div>
  )
}
