import {
  Activity,
  ChevronDown,
  ChevronRight,
  Clock,
  Filter,
  Layers,
  MessageSquare,
  Settings,
  Trash2,
  Zap,
} from 'lucide-react'
import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import type { GatewayClient } from '@/lib/gateway/client'
import type { CronJob, CronRunLogEntry } from '@/lib/gateway/types'
import { createLogger } from '@/lib/logger'
import { cn } from '@/lib/utils'
import { useGatewayStore } from '@/stores/gateway-store'

const log = createLogger('agents:activity')

// ---------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------

type Props = {
  readonly agentId: string
  readonly client: GatewayClient | null
}

type EventCategory = 'all' | 'chat' | 'cron' | 'config' | 'sessions'

type FeedItem = {
  id: string
  ts: number
  category: Exclude<EventCategory, 'all'>
  title: string
  description: string
  payload?: unknown
}

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

const MAX_ITEMS = 200

async function fetchJobRuns(
  client: GatewayClient,
  jobs: CronJob[],
): Promise<Array<CronRunLogEntry & { _jobName?: string }>> {
  const results = await Promise.all(
    jobs.map(async (job) => {
      try {
        const r = await client.request<{ runs: CronRunLogEntry[] }>('cron.runs', { jobId: job.id, limit: 20 })
        return r.runs.map((run) => ({ ...run, _jobName: job.name }))
      } catch (err) {
        log.warn('Failed to load cron runs', err)
        return [] as Array<CronRunLogEntry & { _jobName?: string }>
      }
    }),
  )
  return results.flat()
}

function categorize(event: string): Exclude<EventCategory, 'all'> {
  if (event === 'chat') return 'chat'
  if (event.startsWith('cron')) return 'cron'
  if (event === 'config') return 'config'
  if (event === 'sessions') return 'sessions'
  return 'config' // fallback for skills, etc.
}

function eventBelongsToAgent(event: string, payload: unknown, agentId: string): boolean {
  if (!payload || typeof payload !== 'object') {
    return event === 'config' || event === 'skills'
  }
  const p = payload as Record<string, unknown>
  if (typeof p.sessionKey === 'string' && p.sessionKey.startsWith(`agent:${agentId}:`)) return true
  if (p.agentId === agentId) return true
  // Global events relevant to all agents
  if (['config', 'skills', 'sessions', 'cron.status', 'cron.jobs'].includes(event)) return true
  return false
}

function describeEvent(event: string, payload: unknown): string {
  const p = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>
  if (event === 'chat') {
    const state = (p.state as string) ?? 'unknown'
    const runId = p.runId ? ` · run ${String(p.runId).slice(0, 8)}` : ''
    return `${state}${runId}`
  }
  if (event === 'sessions') return 'Session list updated'
  if (event === 'config') return 'Configuration changed'
  if (event === 'cron.status') return 'Cron status updated'
  if (event === 'cron.jobs') return 'Cron jobs updated'
  if (event === 'skills') return 'Skills reloaded'
  return event
}

function formatRelativeTime(ts: number, now: number): string {
  const diff = now - ts
  if (diff < 5_000) return 'just now'
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

const CATEGORY_COLORS: Record<Exclude<EventCategory, 'all'>, string> = {
  chat: 'text-emerald-500',
  cron: 'text-violet-500',
  config: 'text-amber-500',
  sessions: 'text-sky-500',
}

const CATEGORY_BG: Record<Exclude<EventCategory, 'all'>, string> = {
  chat: 'bg-emerald-500/15',
  cron: 'bg-violet-500/15',
  config: 'bg-amber-500/15',
  sessions: 'bg-sky-500/15',
}

const CATEGORY_ICON: Record<Exclude<EventCategory, 'all'>, typeof Activity> = {
  chat: MessageSquare,
  cron: Clock,
  config: Settings,
  sessions: Layers,
}

type EventLogEntry = { readonly ts: number; readonly event: string; readonly payload?: unknown }

function buildCronRunDescription(run: CronRunLogEntry & { _jobName?: string }): { title: string; description: string } {
  const jobName = run._jobName ?? run.jobId
  const dur = run.durationMs ? `${(run.durationMs / 1000).toFixed(1)}s` : ''
  const durSuffix = dur ? ` · ${dur}` : ''
  const errorSuffix = run.error ? ` · ${run.error}` : ''
  return {
    title: `Cron: ${jobName}`,
    description: `${run.status ?? 'finished'}${durSuffix}${errorSuffix}`,
  }
}

function buildFeedItems(
  eventLog: readonly EventLogEntry[],
  cronRuns: Array<CronRunLogEntry & { _jobName?: string }>,
  agentId: string,
  cleared: number,
): FeedItem[] {
  const items: FeedItem[] = []

  for (let i = 0; i < eventLog.length; i++) {
    const entry = eventLog[i]
    if (cleared && entry.ts <= cleared) continue
    if (!eventBelongsToAgent(entry.event, entry.payload, agentId)) continue
    items.push({
      id: `ev-${entry.ts}-${entry.event}-${i}`,
      ts: entry.ts,
      category: categorize(entry.event),
      title: entry.event,
      description: describeEvent(entry.event, entry.payload),
      payload: entry.payload,
    })
  }

  for (let i = 0; i < cronRuns.length; i++) {
    const run = cronRuns[i]
    if (cleared && run.ts <= cleared) continue
    const { title, description } = buildCronRunDescription(run)
    items.push({
      id: `cron-${run.ts}-${run.jobId}-${i}`,
      ts: run.ts,
      category: 'cron',
      title,
      description,
      payload: run,
    })
  }

  items.sort((a, b) => b.ts - a.ts)
  return items.slice(0, MAX_ITEMS)
}

const FILTER_OPTIONS: { id: EventCategory; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'chat', label: 'Chat' },
  { id: 'cron', label: 'Cron' },
  { id: 'config', label: 'Config' },
  { id: 'sessions', label: 'Sessions' },
]

// ---------------------------------------------------------------------------
//  PayloadViewer
// ---------------------------------------------------------------------------

function PayloadViewer({ payload }: { readonly payload: unknown }) {
  const [open, setOpen] = useState(false)
  if (payload === undefined || payload === null) return null

  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <span>Payload</span>
      </button>
      {open && (
        <pre className="mt-1 max-h-40 overflow-auto rounded-lg border border-border/50 bg-muted/40 p-2 text-[10px] font-mono text-muted-foreground">
          {JSON.stringify(payload, null, 2)}
        </pre>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
//  ActivityItem
// ---------------------------------------------------------------------------

const ActivityItem = memo(function ActivityItem({ item, now }: { readonly item: FeedItem; readonly now: number }) {
  const Icon = CATEGORY_ICON[item.category]

  return (
    <div className="group relative flex gap-3 py-2.5">
      {/* Timeline line */}
      <div className="absolute left-[13px] top-10 bottom-0 w-px bg-border/40 group-last:hidden" />

      {/* Dot + icon */}
      <div
        className={cn(
          'relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
          CATEGORY_BG[item.category],
        )}
      >
        <Icon className={cn('h-3.5 w-3.5', CATEGORY_COLORS[item.category])} />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-foreground truncate">{item.title}</span>
          <Badge
            variant="secondary"
            className={cn(
              'rounded-full px-1.5 py-0 text-[9px] font-medium',
              CATEGORY_BG[item.category],
              CATEGORY_COLORS[item.category],
            )}
          >
            {item.category}
          </Badge>
          <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{formatRelativeTime(item.ts, now)}</span>
        </div>
        <p className="mt-0.5 text-[11px] text-muted-foreground truncate">{item.description}</p>
        <PayloadViewer payload={item.payload} />
      </div>
    </div>
  )
})

// ---------------------------------------------------------------------------
//  ActivityFilter
// ---------------------------------------------------------------------------

function ActivityFilter({
  active,
  onChange,
  counts,
}: {
  readonly active: EventCategory
  readonly onChange: (cat: EventCategory) => void
  readonly counts: Record<EventCategory, number>
}) {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
      <Filter className="mr-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      {FILTER_OPTIONS.map((opt) => (
        <button
          type="button"
          key={opt.id}
          onClick={() => onChange(opt.id)}
          className={cn(
            'flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
            active === opt.id
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
          )}
        >
          <span>{opt.label}</span>
          <Badge variant="secondary" className="h-4 min-w-4 rounded-full px-1 py-0 text-[9px] font-mono">
            {counts[opt.id]}
          </Badge>
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
//  AgentActivity — main export
// ---------------------------------------------------------------------------

export function AgentActivity({ agentId, client }: Props) {
  const eventLog = useGatewayStore((s) => s.eventLog)
  const cronJobs = useGatewayStore((s) => s.cronJobs)

  const [filter, setFilter] = useState<EventCategory>('all')
  const [cronRuns, setCronRuns] = useState<Array<CronRunLogEntry & { _jobName?: string }>>([])

  const [cleared, setCleared] = useState<number>(0) // timestamp of last clear
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!client) return
    const agentJobs = cronJobs.filter((j: CronJob) => j.agentId === agentId)
    if (agentJobs.length === 0) {
      setCronRuns([])
      return
    }

    let cancelled = false
    fetchJobRuns(client, agentJobs)
      .then((runs) => {
        if (!cancelled) setCronRuns(runs)
      })
      .catch((err) => log.warn('Failed to load cron runs for activity feed', err))

    return () => {
      cancelled = true
    }
  }, [client, cronJobs, agentId])

  const feed = useMemo(
    () => buildFeedItems(eventLog, cronRuns, agentId, cleared),
    [eventLog, cronRuns, agentId, cleared],
  )

  const counts = useMemo(() => {
    const c: Record<EventCategory, number> = { all: feed.length, chat: 0, cron: 0, config: 0, sessions: 0 }
    for (const item of feed) c[item.category]++
    return c
  }, [feed])

  const filtered = useMemo(() => (filter === 'all' ? feed : feed.filter((i) => i.category === filter)), [feed, filter])

  const handleClear = useCallback(() => setCleared(Date.now()), [])

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10">
            <Activity className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold tracking-tight">Activity Feed</h3>
            <p className="text-[11px] text-muted-foreground">Real-time events for this agent</p>
          </div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={handleClear}
          className="gap-1.5 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Clear Feed
        </Button>
      </div>

      <Separator className="opacity-50" />

      {/* Filter bar */}
      <div className="rounded-2xl border border-border/50 bg-card/80 backdrop-blur-sm px-3 py-2">
        <ActivityFilter active={filter} onChange={setFilter} counts={counts} />
      </div>

      {/* Timeline */}
      <div className="flex-1 min-h-0">
        <ScrollArea className="h-full">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border/50 bg-muted/30">
                <Zap className="h-5 w-5 text-muted-foreground/40" />
              </div>
              <p className="mt-3 text-sm text-muted-foreground">No activity yet</p>
              <p className="mt-1 text-[11px] text-muted-foreground/60">Events will appear here as the agent runs</p>
            </div>
          ) : (
            <div className="pr-3">
              {filtered.map((item) => (
                <ActivityItem key={item.id} item={item} now={now} />
              ))}
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  )
}
