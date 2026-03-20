import { useVirtualizer } from '@tanstack/react-virtual'
import {
  Bot,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Eraser,
  MessageSquare,
  RefreshCw,
  Search,
  User,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { formatRelativeTime, formatTokens } from '@/lib/format'
import type { SessionsListResult, SessionsPreviewEntry, SessionsPreviewResult } from '@/lib/gateway/types'
import { createLogger } from '@/lib/logger'
import { cn } from '@/lib/utils'
import { selectClient, useGatewayStore } from '@/stores/gateway-store'
import type { AgentInfo, SessionEntry } from '../types'

const log = createLogger('chat:sidebar')

type SessionStatus = 'running' | 'recent' | 'idle'
const RECENT_THRESHOLD_MS = 5 * 60 * 1000

function classifySession(key: string, updatedAt: number | null, activeSessions: Set<string>): SessionStatus {
  if (activeSessions.has(key)) return 'running'
  if (updatedAt && Date.now() - updatedAt < RECENT_THRESHOLD_MS) return 'recent'
  return 'idle'
}

function StatusDot({ status }: { readonly status: SessionStatus }) {
  if (status === 'running') {
    return (
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]" />
      </span>
    )
  }
  if (status === 'recent') {
    return (
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_4px_rgba(245,158,11,0.4)]" />
      </span>
    )
  }
  return (
    <span className="relative flex h-1.5 w-1.5 shrink-0">
      <span className="inline-flex h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
    </span>
  )
}

function statusLabel(status: SessionStatus): string {
  if (status === 'running') return 'Running — agent is actively working'
  if (status === 'recent') return 'Recent — active in the last 5 min'
  return 'Idle'
}

// ── Preview hover card ──

const PREVIEW_CACHE_TTL_MS = 60_000
const PREVIEW_CACHE_MAX = 100
const previewCache = new Map<string, { entry: SessionsPreviewEntry; ts: number }>()

function PreviewHoverCard({ entry }: { readonly entry: SessionsPreviewEntry | null | 'loading' }) {
  if (entry === 'loading') {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
        <RefreshCw className="h-3 w-3 animate-spin" />
        <span>Loading preview…</span>
      </div>
    )
  }
  if (!entry || entry.status === 'missing' || entry.status === 'error') {
    return <div className="text-xs text-muted-foreground py-1">Unable to load preview</div>
  }
  if (entry.status === 'empty' || entry.items.length === 0) {
    return <div className="text-xs text-muted-foreground py-1">Empty session</div>
  }
  return (
    <div className="space-y-1.5 max-w-64">
      {(() => {
        const keyCounts = new Map<string, number>()
        return entry.items.slice(-4).map((item) => {
          const isUser = item.role === 'user'
          const text = item.text.length > 120 ? `${item.text.slice(0, 117)}…` : item.text
          const baseKey = `${item.role}:${item.text.slice(0, 80)}`
          const occurrence = (keyCounts.get(baseKey) ?? 0) + 1
          keyCounts.set(baseKey, occurrence)
          return (
            <div
              key={`${baseKey}:${occurrence}`}
              className={cn('flex flex-col gap-0.5', isUser ? 'items-end' : 'items-start')}
            >
              <span className="text-[9px] font-medium text-muted-foreground uppercase flex items-center gap-1">
                {isUser ? <User className="h-2.5 w-2.5" /> : <Bot className="h-2.5 w-2.5" />}
                {item.role}
              </span>
              <div
                className={cn(
                  'rounded-lg px-2 py-1 text-[11px] leading-snug max-w-full break-words',
                  isUser ? 'bg-primary/10 text-primary-foreground/80' : 'bg-muted text-muted-foreground',
                )}
              >
                {text}
              </div>
            </div>
          )
        })
      })()}
    </div>
  )
}

// ── Session item ──

function SessionItem({
  session,
  selected,
  status,
  onSelect,
}: {
  readonly session: SessionEntry
  readonly selected: boolean
  readonly status: SessionStatus
  readonly onSelect: (key: string) => void
}) {
  const client = useGatewayStore(selectClient)
  const [preview, setPreview] = useState<SessionsPreviewEntry | null | 'loading'>(null)
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [hovered, setHovered] = useState(false)

  const handleMouseEnter = useCallback(() => {
    setHovered(true)
    const cached = previewCache.get(session.key)
    if (cached && Date.now() - cached.ts < PREVIEW_CACHE_TTL_MS) {
      setPreview(cached.entry)
      return
    }
    hoverTimerRef.current = setTimeout(async () => {
      if (!client?.connected) return
      setPreview('loading')
      try {
        const r = await client.request<SessionsPreviewResult>('sessions.preview', {
          keys: [session.key],
          limit: 4,
          maxChars: 120,
        })
        const entry = r?.previews?.[0] ?? null
        if (entry) {
          previewCache.set(session.key, { entry, ts: Date.now() })
          if (previewCache.size > PREVIEW_CACHE_MAX) {
            const oldest = previewCache.keys().next().value
            if (oldest) previewCache.delete(oldest)
          }
        }
        setPreview(entry)
      } catch (err) {
        log.warn('Session preview fetch failed', err)
        setPreview(null)
      }
    }, 300)
  }, [client, session.key])

  const handleMouseLeave = useCallback(() => {
    setHovered(false)
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
    }
    setPreview(null)
  }, [])

  const timeAgo = session.updatedAt ? formatRelativeTime(session.updatedAt) : null

  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip open={hovered && preview !== null}>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => onSelect(session.key)}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            className={cn(
              'group flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-all duration-150',
              selected
                ? 'bg-accent text-accent-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
              status === 'running' && !selected && 'bg-emerald-500/5 border border-emerald-500/10',
              status === 'running' && selected && 'ring-1 ring-emerald-500/30',
            )}
          >
            <StatusDot status={status} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="truncate font-mono text-[11px] font-medium">{session.label}</span>
              </div>
              {session.preview && (
                <span className="block truncate text-[10px] text-muted-foreground/70 mt-0.5">{session.preview}</span>
              )}
            </div>
            <div className="flex flex-col items-end gap-0.5 shrink-0">
              <div className="group-hover:hidden flex flex-col items-end gap-0.5">
                {timeAgo && <span className="text-[9px] text-muted-foreground/50">{timeAgo}</span>}
                {session.totalTokens ? (
                  <span className="text-[9px] opacity-40 font-mono tabular-nums">
                    {formatTokens(session.totalTokens)}
                  </span>
                ) : null}
              </div>
              <div className="hidden group-hover:flex items-center gap-0.5">
                <button
                  type="button"
                  title="Compact context"
                  className="h-5 w-5 rounded inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (!client?.connected) return
                    client.request('sessions.compact', { key: session.key }).then(
                      () => toast.success('Context compacted'),
                      () => toast.error('Compact failed'),
                    )
                  }}
                >
                  <Eraser className="h-3 w-3" />
                </button>
              </div>
            </div>
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="text-xs p-3 max-w-72">
          <p className="font-medium mb-1">{session.label}</p>
          <p className="text-muted-foreground mb-2">{statusLabel(status)}</p>
          {session.model && <p className="text-muted-foreground font-mono mb-2 text-[10px]">{session.model}</p>}
          <PreviewHoverCard entry={preview} />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// ── Agent group header (collapsible) ──

function AgentGroupHeader({
  agentId,
  info,
  statuses,
  sessionCount,
  collapsed,
  onToggle,
}: {
  readonly agentId: string
  readonly info?: AgentInfo
  readonly statuses: SessionStatus[]
  readonly sessionCount: number
  readonly collapsed: boolean
  readonly onToggle: () => void
}) {
  const runningCount = statuses.filter((s) => s === 'running').length

  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-1.5 px-2.5 py-2 hover:bg-accent/30 rounded-md transition-colors group"
    >
      {collapsed ? (
        <ChevronRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />
      ) : (
        <ChevronDown className="h-3 w-3 text-muted-foreground/50 shrink-0" />
      )}
      <span className="text-sm shrink-0">{info?.emoji || '🤖'}</span>
      <span className="text-[11px] font-semibold text-foreground/80 truncate">{info?.name || agentId}</span>
      <div className="ml-auto flex items-center gap-1.5">
        {runningCount > 0 && (
          <span className="flex items-center gap-0.5 text-[9px] font-medium text-emerald-500">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            {runningCount}
          </span>
        )}
        <span className="text-[9px] text-muted-foreground/40 font-mono">{sessionCount}</span>
      </div>
    </button>
  )
}

// ── Flat item types for virtualization ──

type FlatItem =
  | {
      readonly kind: 'header'
      readonly agentId: string
      readonly info?: AgentInfo
      readonly statuses: SessionStatus[]
      readonly sessionCount: number
    }
  | { readonly kind: 'session'; readonly session: SessionEntry & { status: SessionStatus } }

const HEADER_HEIGHT = 36
const SESSION_HEIGHT = 44

// ── Virtual session list ──

function VirtualSessionList({
  grouped,
  agents,
  selected,
  onSelect,
  collapsedAgents,
  onToggleAgent,
}: {
  readonly grouped: Map<string, Array<SessionEntry & { status: SessionStatus }>>
  readonly agents: Map<string, AgentInfo>
  readonly selected: string | null
  readonly onSelect: (key: string) => void
  readonly collapsedAgents: Set<string>
  readonly onToggleAgent: (agentId: string) => void
}) {
  const parentRef = useRef<HTMLDivElement>(null)

  const flatItems = useMemo(() => {
    const items: FlatItem[] = []
    for (const [agentId, sessions] of grouped) {
      items.push({
        kind: 'header',
        agentId,
        info: agents.get(agentId),
        statuses: sessions.map((s) => s.status),
        sessionCount: sessions.length,
      })
      if (!collapsedAgents.has(agentId)) {
        for (const s of sessions) items.push({ kind: 'session', session: s })
      }
    }
    return items
  }, [grouped, agents, collapsedAgents])

  const virtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => (flatItems[i].kind === 'header' ? HEADER_HEIGHT : SESSION_HEIGHT),
    overscan: 10,
  })

  if (flatItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-4 py-10">
        <Search className="h-5 w-5 text-muted-foreground/30" />
        <span className="text-xs text-muted-foreground">No sessions found</span>
      </div>
    )
  }

  return (
    <div ref={parentRef} className="flex-1 overflow-y-auto">
      <div className="relative px-2.5 py-1" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((vRow) => {
          const item = flatItems[vRow.index]
          return (
            <div
              key={vRow.key}
              className="absolute left-0 right-0 px-2.5"
              style={{ height: vRow.size, transform: `translateY(${vRow.start}px)` }}
            >
              {item.kind === 'header' ? (
                <AgentGroupHeader
                  agentId={item.agentId}
                  info={item.info}
                  statuses={item.statuses}
                  sessionCount={item.sessionCount}
                  collapsed={collapsedAgents.has(item.agentId)}
                  onToggle={() => onToggleAgent(item.agentId)}
                />
              ) : (
                <SessionItem
                  session={item.session}
                  selected={selected === item.session.key}
                  status={item.session.status}
                  onSelect={onSelect}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Sidebar ──

export function SessionSidebar({
  sessions,
  agents,
  selected,
  onSelect,
  search,
  onSearchChange,
  activeSessions,
}: {
  readonly sessions: SessionEntry[]
  readonly agents: Map<string, AgentInfo>
  readonly selected: string | null
  readonly onSelect: (key: string) => void
  readonly search: string
  readonly onSearchChange: (v: string) => void
  readonly activeSessions: Set<string>
}) {
  const client = useGatewayStore(selectClient)
  const [refreshing, setRefreshing] = useState(false)
  const [collapsedAgents, setCollapsedAgents] = useState<Set<string>>(new Set())

  const toggleAgent = useCallback((agentId: string) => {
    setCollapsedAgents((prev) => {
      const next = new Set(prev)
      if (next.has(agentId)) next.delete(agentId)
      else next.add(agentId)
      return next
    })
  }, [])

  const handleRefreshSessions = useCallback(async () => {
    if (!client?.connected || refreshing) return
    setRefreshing(true)
    try {
      const r = await client.request<SessionsListResult>('sessions.list', {
        includeGlobal: false,
        includeUnknown: false,
      })
      if (r?.sessions) useGatewayStore.getState().setSessions(r.sessions)
    } catch (err) {
      log.warn('Sessions list refresh failed', err)
    }
    setRefreshing(false)
  }, [client, refreshing])

  const [, forceTick] = useReducer((value: number) => value + 1, 0)
  const hasActiveOrRecent = sessions.some(
    (s) => activeSessions.has(s.key) || (s.updatedAt && Date.now() - s.updatedAt < RECENT_THRESHOLD_MS),
  )
  useEffect(() => {
    if (!hasActiveOrRecent) return
    const id = setInterval(() => forceTick(), 30_000)
    return () => clearInterval(id)
  }, [hasActiveOrRecent])

  const grouped = useMemo(() => {
    const map = new Map<string, Array<SessionEntry & { status: SessionStatus }>>()
    const q = search.toLowerCase()
    for (const s of sessions) {
      if (q && !s.key.toLowerCase().includes(q) && !s.agentId.toLowerCase().includes(q)) continue
      const status = classifySession(s.key, s.updatedAt, activeSessions)
      const arr = map.get(s.agentId) || []
      arr.push({ ...s, status })
      map.set(s.agentId, arr)
    }
    const statusOrder: Record<SessionStatus, number> = { running: 0, recent: 1, idle: 2 }
    for (const [, arr] of map) {
      arr.sort((a, b) => statusOrder[a.status] - statusOrder[b.status])
    }
    return map
  }, [sessions, search, activeSessions])

  const globalCounts = useMemo(() => {
    let running = 0
    let total = 0
    for (const [, arr] of grouped) {
      total += arr.length
      for (const s of arr) {
        if (s.status === 'running') running++
      }
    }
    return { running, total }
  }, [grouped])

  return (
    <div className="flex h-full w-72 flex-col border-r border-border bg-sidebar">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold text-foreground">Sessions</span>
        <div className="ml-auto flex items-center gap-1.5">
          {globalCounts.running > 0 && (
            <Badge
              variant="secondary"
              className="text-[9px] font-mono px-1.5 py-0 bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
            >
              {globalCounts.running} live
            </Badge>
          )}
          <Badge variant="secondary" className="text-[9px] font-mono px-1.5 py-0">
            {globalCounts.total}
          </Badge>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={handleRefreshSessions}
                  disabled={refreshing}
                  className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Refresh sessions</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-1.5 px-3 py-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Filter sessions…"
            className="h-8 pl-8 text-xs"
          />
        </div>
        {grouped.size > 1 && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => {
                    const allAgentIds = [...grouped.keys()]
                    const allCollapsed = allAgentIds.every((id) => collapsedAgents.has(id))
                    setCollapsedAgents(allCollapsed ? new Set() : new Set(allAgentIds))
                  }}
                  className="h-8 w-8 shrink-0 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  {[...grouped.keys()].every((id) => collapsedAgents.has(id)) ? (
                    <ChevronsUpDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronsDownUp className="h-3.5 w-3.5" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {[...grouped.keys()].every((id) => collapsedAgents.has(id)) ? 'Expand all' : 'Collapse all'}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      {/* Session list */}
      <VirtualSessionList
        grouped={grouped}
        agents={agents}
        selected={selected}
        onSelect={onSelect}
        collapsedAgents={collapsedAgents}
        onToggleAgent={toggleAgent}
      />
    </div>
  )
}
