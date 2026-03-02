import { useVirtualizer } from '@tanstack/react-virtual'
import { Bot, MessageSquare, RefreshCw, Search, User } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { formatTokens } from '@/lib/format'
import type { SessionsListResult, SessionsPreviewEntry, SessionsPreviewResult } from '@/lib/gateway/types'
import { createLogger } from '@/lib/logger'
import { cn } from '@/lib/utils'
import { selectClient, useGatewayStore } from '@/stores/gateway-store'
import type { AgentInfo, SessionEntry } from '../types'

const log = createLogger('chat:sidebar')

// ---------------------------------------------------------------------------
//  Session status classification — real-time from activeRuns + updatedAt
// ---------------------------------------------------------------------------

type SessionStatus = 'running' | 'recent' | 'idle'

const RECENT_THRESHOLD_MS = 5 * 60 * 1000 // 5 minutes

function classifySession(key: string, updatedAt: number | null, activeSessions: Set<string>): SessionStatus {
  if (activeSessions.has(key)) return 'running'
  if (updatedAt && Date.now() - updatedAt < RECENT_THRESHOLD_MS) return 'recent'
  return 'idle'
}

// ---------------------------------------------------------------------------
//  Status indicator dot — zero-delay, pure CSS animations
// ---------------------------------------------------------------------------

function StatusDot({ status }: { status: SessionStatus }) {
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

// ---------------------------------------------------------------------------
//  Status tooltip label
// ---------------------------------------------------------------------------

function statusLabel(status: SessionStatus): string {
  if (status === 'running') return 'Running — agent is actively working'
  if (status === 'recent') return 'Recent — active in the last 5 min'
  return 'Idle'
}

// ---------------------------------------------------------------------------
//  Session item
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
//  Preview hover card — shows last messages on hover
// ---------------------------------------------------------------------------

function PreviewHoverCard({ entry }: { entry: SessionsPreviewEntry | null | 'loading' }) {
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
      {entry.items.slice(-4).map((item, i) => {
        const isUser = item.role === 'user'
        const text = item.text.length > 120 ? `${item.text.slice(0, 117)}…` : item.text
        return (
          <div key={i} className={cn('flex flex-col gap-0.5', isUser ? 'items-end' : 'items-start')}>
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
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
//  Shared preview cache (module-level, persists across re-renders)
// ---------------------------------------------------------------------------

const PREVIEW_CACHE_TTL_MS = 60_000
const PREVIEW_CACHE_MAX = 100
const previewCache = new Map<string, { entry: SessionsPreviewEntry; ts: number }>()

function SessionItem({
  session,
  selected,
  status,
  onSelect,
}: {
  session: SessionEntry
  selected: boolean
  status: SessionStatus
  onSelect: (key: string) => void
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
    // Debounce 300ms
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
              'group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-all duration-150',
              selected
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
              status === 'running' && !selected && 'bg-emerald-500/5 border border-emerald-500/10',
              status === 'running' && selected && 'ring-1 ring-emerald-500/30',
            )}
          >
            <StatusDot status={status} />
            <span className="flex-1 flex flex-col min-w-0">
              <span className="truncate font-mono">{session.label}</span>
              {session.preview && <span className="truncate text-xs text-muted-foreground">{session.preview}</span>}
            </span>
            {session.totalTokens ? (
              <span className="text-[10px] opacity-50 font-mono tabular-nums">
                {formatTokens(session.totalTokens ?? 0)}
              </span>
            ) : null}
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="text-xs p-3">
          <p className="font-medium mb-1">{session.label}</p>
          <p className="text-muted-foreground mb-2">{statusLabel(status)}</p>
          {session.model && <p className="text-muted-foreground font-mono mb-2">{session.model}</p>}
          <PreviewHoverCard entry={preview} />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// ---------------------------------------------------------------------------
//  Agent group header — shows aggregate status
// ---------------------------------------------------------------------------

function AgentGroupHeader({
  agentId,
  info,
  statuses,
}: {
  agentId: string
  info?: AgentInfo
  statuses: SessionStatus[]
}) {
  const runningCount = statuses.filter((s) => s === 'running').length
  const recentCount = statuses.filter((s) => s === 'recent').length

  return (
    <div className="flex items-center gap-1.5 px-2 py-1.5">
      <span className="text-sm">{info?.emoji || '🤖'}</span>
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {info?.name || agentId}
      </span>
      <div className="ml-auto flex items-center gap-1">
        {runningCount > 0 && (
          <span className="flex items-center gap-0.5 text-[9px] font-medium text-emerald-500">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            {runningCount}
          </span>
        )}
        {recentCount > 0 && (
          <span className="flex items-center gap-0.5 text-[9px] font-medium text-amber-400">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            {recentCount}
          </span>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
//  Virtualized session list — flat items for efficient rendering
// ---------------------------------------------------------------------------

type FlatItem =
  | { kind: 'header'; agentId: string; info?: AgentInfo; statuses: SessionStatus[] }
  | { kind: 'session'; session: SessionEntry & { status: SessionStatus } }

const HEADER_HEIGHT = 32
const SESSION_HEIGHT = 40

function VirtualSessionList({
  grouped,
  agents,
  selected,
  onSelect,
}: {
  grouped: Map<string, Array<SessionEntry & { status: SessionStatus }>>
  agents: Map<string, AgentInfo>
  selected: string | null
  onSelect: (key: string) => void
}) {
  const parentRef = useRef<HTMLDivElement>(null)

  const flatItems = useMemo(() => {
    const items: FlatItem[] = []
    for (const [agentId, sessions] of grouped) {
      items.push({ kind: 'header', agentId, info: agents.get(agentId), statuses: sessions.map((s) => s.status) })
      for (const s of sessions) items.push({ kind: 'session', session: s })
    }
    return items
  }, [grouped, agents])

  const virtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => (flatItems[i].kind === 'header' ? HEADER_HEIGHT : SESSION_HEIGHT),
    overscan: 10,
  })

  if (flatItems.length === 0) {
    return <div className="px-4 py-8 text-center text-xs text-muted-foreground">No sessions found</div>
  }

  return (
    <div ref={parentRef} className="flex-1 overflow-y-auto">
      <div className="relative px-2 py-1" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((vRow) => {
          const item = flatItems[vRow.index]
          return (
            <div
              key={vRow.key}
              className="absolute left-0 right-0 px-0"
              style={{ height: vRow.size, transform: `translateY(${vRow.start}px)` }}
            >
              {item.kind === 'header' ? (
                <AgentGroupHeader agentId={item.agentId} info={item.info} statuses={item.statuses} />
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

// ---------------------------------------------------------------------------
//  Sidebar
// ---------------------------------------------------------------------------

export function SessionSidebar({
  sessions,
  agents,
  selected,
  onSelect,
  search,
  onSearchChange,
  activeSessions,
}: {
  sessions: SessionEntry[]
  agents: Map<string, AgentInfo>
  selected: string | null
  onSelect: (key: string) => void
  search: string
  onSearchChange: (v: string) => void
  activeSessions: Set<string>
}) {
  const client = useGatewayStore(selectClient)
  const [refreshing, setRefreshing] = useState(false)

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

  // Re-evaluate session statuses only when there are recent/running sessions
  // that may transition. Uses 30s interval instead of 1s to reduce re-renders.
  const [, setTick] = useState(0)
  const hasActiveOrRecent = sessions.some(
    (s) => activeSessions.has(s.key) || (s.updatedAt && Date.now() - s.updatedAt < RECENT_THRESHOLD_MS),
  )
  useEffect(() => {
    if (!hasActiveOrRecent) return
    const id = setInterval(() => setTick((t) => t + 1), 30_000)
    return () => clearInterval(id)
  }, [hasActiveOrRecent])

  // Group sessions by agent, with status classification
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
    // Sort each group: running first, then recent, then idle
    const statusOrder: Record<SessionStatus, number> = { running: 0, recent: 1, idle: 2 }
    for (const [, arr] of map) {
      arr.sort((a, b) => statusOrder[a.status] - statusOrder[b.status])
    }
    return map
  }, [sessions, search, activeSessions])

  // Global counts for header badge
  const globalCounts = useMemo(() => {
    let running = 0,
      recent = 0
    for (const [, arr] of grouped) {
      for (const s of arr) {
        if (s.status === 'running') running++
        else if (s.status === 'recent') recent++
      }
    }
    return { running, recent }
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
          <Badge variant="secondary" className="text-xs font-mono">
            {sessions.length}
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
      <div className="px-3 py-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Filter sessions…"
            className="h-8 pl-8 text-xs"
          />
        </div>
      </div>

      {/* Session list (virtualized) */}
      <VirtualSessionList grouped={grouped} agents={agents} selected={selected} onSelect={onSelect} />
    </div>
  )
}
