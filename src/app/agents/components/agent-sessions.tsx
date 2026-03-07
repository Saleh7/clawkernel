import { useVirtualizer } from '@tanstack/react-virtual'
import {
  Activity,
  ArrowUpDown,
  Brain,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Clock,
  Cpu,
  Eye,
  Hash,
  History,
  Layers,
  Radio,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Zap,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DeleteSessionDialog, HistoryDialog, PatchSessionDialog, SendMessageDialog } from '@/components/session-dialogs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { formatRelativeTime, formatTokens } from '@/lib/format'
import type { GatewaySessionRow } from '@/lib/gateway/types'
import { createLogger } from '@/lib/logger'
import { ACTIVE_SESSION_MS } from '@/lib/session-constants'
import { refreshSessions } from '@/lib/session-ops'
import { cn } from '@/lib/utils'
import type { useGatewayStore } from '@/stores/gateway-store'
import { AgentStatPill } from './agent-stat-pill'
import { AgentTabEmptyState } from './agent-tab-empty-state'

const log = createLogger('agents:sessions')
const COLLAPSED_ROW_HEIGHT = 72
const EXPANDED_ROW_HEIGHT = 340

type Props = {
  readonly agentId: string
  readonly sessions: GatewaySessionRow[]
  readonly activeRuns: Record<string, { sessionKey: string; startedAt: number }>
  readonly client: ReturnType<typeof useGatewayStore.getState>['client']
}

type SortKey = 'updated' | 'tokens' | 'name'
type SortDir = 'asc' | 'desc'

function sessionBelongsToAgent(key: string, agentId: string): boolean {
  return key.startsWith(`agent:${agentId}:`)
}

function extractSessionLabel(session: GatewaySessionRow): string {
  return session.displayName || session.label || session.key.split(':').pop() || session.key
}

function extractSessionType(key: string): string {
  if (key.includes(':group:')) return 'group'
  if (key.includes(':subagent:')) return 'subagent'
  return 'direct'
}

function sessionDotClass(isRunning: boolean, isActive: boolean, hasUpdatedAt: boolean): string {
  if (isRunning) return 'bg-emerald-400 animate-pulse'
  if (isActive) return 'bg-emerald-500'
  if (hasUpdatedAt) return 'bg-amber-500/60'
  return 'bg-muted-foreground/30'
}

const kindColors: Record<string, string> = {
  direct: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400',
  group: 'border-sky-500/20 bg-sky-500/10 text-sky-400',
  global: 'border-amber-500/20 bg-amber-500/10 text-amber-400',
  unknown: 'border-border bg-muted text-muted-foreground',
  subagent: 'border-violet-500/20 bg-violet-500/10 text-violet-400',
}

function SessionStatsBar({
  total,
  active,
  totalTokens,
  uniqueSurfaces,
}: {
  readonly total: number
  readonly active: number
  readonly totalTokens: number
  readonly uniqueSurfaces: number
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <AgentStatPill icon={Layers} value={total} label="sessions" />
      <AgentStatPill
        icon={Activity}
        value={active}
        label="active"
        iconClassName="text-emerald-400"
        valueClassName="text-emerald-400"
      />
      <AgentStatPill icon={Zap} value={formatTokens(totalTokens)} label="tokens" iconClassName="text-amber-400" />
      {uniqueSurfaces > 0 && <AgentStatPill icon={Radio} value={uniqueSurfaces} label="surfaces" />}
    </div>
  )
}

function SessionCard({
  session,
  isRunning,
  isExpanded,
  onToggle,
  onPatch,
  onDelete,
  onSendMessage,
  onViewHistory,
}: {
  readonly session: GatewaySessionRow
  readonly isRunning: boolean
  readonly isExpanded: boolean
  readonly onToggle: () => void
  readonly onPatch: () => void
  readonly onDelete: () => void
  readonly onSendMessage: () => void
  readonly onViewHistory: () => void
}) {
  const label = extractSessionLabel(session)
  const sessionType = extractSessionType(session.key)
  const kindClass = kindColors[sessionType] || kindColors[session.kind] || kindColors.unknown

  const isActive = session.updatedAt ? Date.now() - session.updatedAt < ACTIVE_SESSION_MS : false

  return (
    <div
      className={cn(
        'group rounded-2xl border border-border/50 bg-card/80 backdrop-blur-sm transition-all duration-200',
        isExpanded && 'border-primary/30 ring-1 ring-primary/10',
        isRunning && 'border-emerald-500/30',
      )}
    >
      {/* Header row */}
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        {/* Status indicator */}
        <div className="relative shrink-0">
          <div
            className={cn('h-2.5 w-2.5 rounded-full', sessionDotClass(isRunning, isActive, Boolean(session.updatedAt)))}
          />
        </div>

        {/* Name + metadata */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-foreground">{label}</p>
            <Badge
              variant="outline"
              className={cn(
                'shrink-0 rounded-full px-2 py-0 text-[9px] font-medium uppercase tracking-wider',
                kindClass,
              )}
            >
              {sessionType}
            </Badge>
            {isRunning && (
              <Badge className="shrink-0 animate-pulse rounded-full bg-emerald-500/15 px-2 py-0 text-[9px] font-semibold text-emerald-400 border-emerald-500/30">
                <CircleDot className="mr-1 h-2.5 w-2.5" />
                running
              </Badge>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
            {session.surface && (
              <span className="flex items-center gap-1">
                <Hash className="h-3 w-3" />
                {session.surface}
              </span>
            )}
            {session.model && (
              <span className="flex items-center gap-1 font-mono">
                <Cpu className="h-3 w-3" />
                {session.model}
              </span>
            )}
            {session.updatedAt && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatRelativeTime(session.updatedAt)}
              </span>
            )}
            {(session.totalTokens ?? 0) > 0 && (
              <span className="flex items-center gap-1 font-mono">
                <Zap className="h-3 w-3" />
                {formatTokens(session.totalTokens!)}
              </span>
            )}
          </div>
        </div>

        {/* Expand icon */}
        <div className="shrink-0 text-muted-foreground/50 transition-transform duration-200">
          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </div>
      </button>

      {/* Expanded details */}
      {isExpanded && (
        <div className="animate-in fade-in slide-in-from-top-1 duration-200 border-t border-border/40 px-4 pb-4 pt-3">
          {/* Token breakdown */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <TokenStat label="Input" value={session.inputTokens} />
            <TokenStat label="Output" value={session.outputTokens} />
            <TokenStat label="Context" value={session.contextTokens} />
            <TokenStat label="Total" value={session.totalTokens} highlight />
          </div>

          {/* Session key */}
          <div className="mt-3 rounded-lg border border-border/30 bg-background/50 px-3 py-2">
            <p className="font-mono text-[10px] text-muted-foreground/70 break-all select-all">{session.key}</p>
          </div>

          {/* Settings badges */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {session.thinkingLevel && session.thinkingLevel !== 'off' && (
              <Badge variant="outline" className="rounded-full px-2.5 py-0.5 text-[10px]">
                <Brain className="mr-1 h-3 w-3" /> thinking: {session.thinkingLevel}
              </Badge>
            )}
            {session.reasoningLevel && session.reasoningLevel !== 'off' && (
              <Badge variant="outline" className="rounded-full px-2.5 py-0.5 text-[10px]">
                <Sparkles className="mr-1 h-3 w-3" /> reasoning: {session.reasoningLevel}
              </Badge>
            )}
            {session.verboseLevel && session.verboseLevel !== 'off' && (
              <Badge variant="outline" className="rounded-full px-2.5 py-0.5 text-[10px]">
                <Eye className="mr-1 h-3 w-3" /> verbose: {session.verboseLevel}
              </Badge>
            )}
            {session.elevatedLevel && session.elevatedLevel !== 'off' && (
              <Badge variant="outline" className="rounded-full px-2.5 py-0.5 text-[10px]">
                <ShieldCheck className="mr-1 h-3 w-3" /> elevated: {session.elevatedLevel}
              </Badge>
            )}
          </div>

          {/* Actions */}
          <Separator className="my-3 opacity-40" />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 rounded-full px-3 text-[11px]"
              onClick={onSendMessage}
            >
              <Send className="h-3 w-3" />
              Send Message
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 rounded-full px-3 text-[11px]"
              onClick={onViewHistory}
            >
              <History className="h-3 w-3" />
              History
            </Button>
            <Button size="sm" variant="outline" className="h-7 gap-1.5 rounded-full px-3 text-[11px]" onClick={onPatch}>
              <Settings2 className="h-3 w-3" />
              Patch
            </Button>
            <div className="flex-1" />
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1.5 rounded-full px-3 text-[11px] text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="h-3 w-3" />
              Delete
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function TokenStat({
  label,
  value,
  highlight,
}: {
  readonly label: string
  readonly value?: number | null
  readonly highlight?: boolean
}) {
  return (
    <div className="rounded-lg border border-border/30 bg-background/40 px-3 py-2 text-center">
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn('mt-0.5 font-mono text-sm font-semibold', highlight ? 'text-primary' : 'text-foreground')}>
        {value === null || value === undefined ? '—' : formatTokens(value)}
      </p>
    </div>
  )
}

function VirtualSessionCards({
  listRef,
  sessions,
  runningKeys,
  expandedKey,
  onToggle,
  onPatch,
  onDelete,
  onSendMessage,
  onViewHistory,
  search,
}: {
  readonly listRef: React.RefObject<HTMLDivElement | null>
  readonly sessions: GatewaySessionRow[]
  readonly runningKeys: Set<string>
  readonly expandedKey: string | null
  readonly onToggle: (key: string) => void
  readonly onPatch: (s: GatewaySessionRow) => void
  readonly onDelete: (s: GatewaySessionRow) => void
  readonly onSendMessage: (s: GatewaySessionRow) => void
  readonly onViewHistory: (s: GatewaySessionRow) => void
  readonly search: string
}) {
  const virtualizer = useVirtualizer({
    count: sessions.length,
    getScrollElement: () => listRef.current,
    estimateSize: (i) => (sessions[i].key === expandedKey ? EXPANDED_ROW_HEIGHT : COLLAPSED_ROW_HEIGHT),
    overscan: 5,
    getItemKey: (i) => sessions[i].key,
  })

  // Re-measure when expanded key changes so row heights update
  // biome-ignore lint/correctness/useExhaustiveDependencies: expandedKey triggers re-measurement intentionally
  useEffect(() => {
    virtualizer.measure()
  }, [expandedKey])

  if (sessions.length === 0 && search) {
    return (
      <div className="rounded-2xl border border-dashed border-border/40 bg-card/20 p-8 text-center">
        <Search className="mx-auto h-6 w-6 text-muted-foreground/20" />
        <p className="mt-2 text-xs text-muted-foreground/50">No sessions matching "{search}"</p>
      </div>
    )
  }

  return (
    <div ref={listRef} className="max-h-[70vh] overflow-y-auto">
      <ul className="relative list-none" style={{ height: virtualizer.getTotalSize() }} aria-label="Agent sessions">
        {virtualizer.getVirtualItems().map((vRow) => {
          const session = sessions[vRow.index]
          return (
            <li
              key={vRow.key}
              className="absolute left-0 right-0"
              style={{ height: vRow.size, transform: `translateY(${vRow.start}px)` }}
            >
              <div className="pb-2">
                <SessionCard
                  session={session}
                  isRunning={runningKeys.has(session.key)}
                  isExpanded={expandedKey === session.key}
                  onToggle={() => onToggle(session.key)}
                  onPatch={() => onPatch(session)}
                  onDelete={() => onDelete(session)}
                  onSendMessage={() => onSendMessage(session)}
                  onViewHistory={() => onViewHistory(session)}
                />
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function AgentSessions({ agentId, sessions, activeRuns, client }: Props) {
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('updated')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  const [sendTarget, setSendTarget] = useState<GatewaySessionRow | null>(null)
  const [patchTarget, setPatchTarget] = useState<GatewaySessionRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<GatewaySessionRow | null>(null)
  const [historyTarget, setHistoryTarget] = useState<GatewaySessionRow | null>(null)

  const agentSessions = useMemo(() => {
    return sessions.filter((s) => sessionBelongsToAgent(s.key, agentId))
  }, [sessions, agentId])

  const filteredSorted = useMemo(() => {
    let list = agentSessions
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (s) =>
          s.key.toLowerCase().includes(q) ||
          (s.displayName || '').toLowerCase().includes(q) ||
          (s.label || '').toLowerCase().includes(q) ||
          (s.surface || '').toLowerCase().includes(q) ||
          (s.model || '').toLowerCase().includes(q),
      )
    }

    return [...list].sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'updated':
          cmp = (a.updatedAt ?? 0) - (b.updatedAt ?? 0)
          break
        case 'tokens':
          cmp = (a.totalTokens ?? 0) - (b.totalTokens ?? 0)
          break
        case 'name':
          cmp = extractSessionLabel(a).localeCompare(extractSessionLabel(b))
          break
      }
      return sortDir === 'desc' ? -cmp : cmp
    })
  }, [agentSessions, search, sortKey, sortDir])

  const stats = useMemo(() => {
    const now = Date.now()
    const active = agentSessions.filter((s) => s.updatedAt && now - s.updatedAt < ACTIVE_SESSION_MS).length
    const totalTokens = agentSessions.reduce((sum, s) => sum + (s.totalTokens ?? 0), 0)
    const surfaces = new Set(agentSessions.map((s) => s.surface).filter(Boolean))
    return { total: agentSessions.length, active, totalTokens, uniqueSurfaces: surfaces.size }
  }, [agentSessions])

  const runningKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const run of Object.values(activeRuns)) {
      if (sessionBelongsToAgent(run.sessionKey, agentId)) {
        keys.add(run.sessionKey)
      }
    }
    return keys
  }, [activeRuns, agentId])

  const refresh = useCallback(async () => {
    if (!client?.connected) return
    setRefreshing(true)
    try {
      await refreshSessions(client)
    } catch (err) {
      log.warn('Sessions refresh failed', err)
    }
    setRefreshing(false)
  }, [client])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  if (agentSessions.length === 0) {
    return (
      <AgentTabEmptyState
        icon={Layers}
        title="No sessions for this agent"
        action={
          <Button size="sm" variant="outline" className="gap-1.5 rounded-full" onClick={() => void refresh()}>
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        }
      />
    )
  }

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <SessionStatsBar
        total={stats.total}
        active={stats.active}
        totalTokens={stats.totalTokens}
        uniqueSurfaces={stats.uniqueSurfaces}
      />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search sessions..."
            className="h-8 pl-9 text-xs rounded-full bg-background/60 border-border/50"
          />
        </div>

        <div className="flex gap-1">
          {(['updated', 'tokens', 'name'] as SortKey[]).map((key) => (
            <Button
              key={key}
              size="sm"
              variant={sortKey === key ? 'secondary' : 'ghost'}
              className="h-7 gap-1 rounded-full px-2.5 text-[10px] uppercase tracking-wider"
              onClick={() => toggleSort(key)}
            >
              {key}
              {sortKey === key && <ArrowUpDown className="h-3 w-3" />}
            </Button>
          ))}
        </div>

        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 rounded-full px-3 text-[11px]"
          onClick={() => void refresh()}
          disabled={refreshing}
        >
          <RefreshCw className={cn('h-3 w-3', refreshing && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Session list (virtualized) */}
      <VirtualSessionCards
        listRef={listRef}
        sessions={filteredSorted}
        runningKeys={runningKeys}
        expandedKey={expandedKey}
        onToggle={(key) => setExpandedKey((prev) => (prev === key ? null : key))}
        onPatch={setPatchTarget}
        onDelete={setDeleteTarget}
        onSendMessage={setSendTarget}
        onViewHistory={setHistoryTarget}
        search={search}
      />

      {/* Dialogs */}
      <SendMessageDialog
        open={!!sendTarget}
        onOpenChange={(o) => !o && setSendTarget(null)}
        session={sendTarget}
        client={client}
      />
      <PatchSessionDialog
        open={!!patchTarget}
        onOpenChange={(o) => !o && setPatchTarget(null)}
        session={patchTarget}
        client={client}
        onPatched={refresh}
      />
      <HistoryDialog
        open={!!historyTarget}
        onOpenChange={(o) => !o && setHistoryTarget(null)}
        session={historyTarget}
        client={client}
      />
      <DeleteSessionDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        session={deleteTarget}
        client={client}
        onDeleted={refresh}
      />
    </div>
  )
}
