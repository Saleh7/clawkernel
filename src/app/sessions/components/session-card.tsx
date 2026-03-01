import {
  CheckSquare,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  ScrollText,
  Settings,
  Square,
  Trash2,
} from 'lucide-react'
import { memo, useEffect, useRef } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { GatewaySessionRow } from '@/lib/gateway/types'
import { ACTIVE_SESSION_MS } from '@/lib/session-constants'
import { cn } from '@/lib/utils'
import { extractAgentId, formatRelativeTime, formatTokens, getDisplayName } from '../utils'

// ---------------------------------------------------------------------------

const StatusDot = memo(function StatusDot({ isRunning, updatedAt }: { isRunning: boolean; updatedAt: number | null }) {
  const active = !!updatedAt && Date.now() - updatedAt < ACTIVE_SESSION_MS
  const recent = !!updatedAt && Date.now() - updatedAt < 3_600_000

  if (isRunning)
    return (
      <span className="relative flex h-2.5 w-2.5" aria-hidden>
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
      </span>
    )
  if (active) return <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" aria-hidden />
  if (recent) return <span className="inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" aria-hidden />
  return <span className="inline-flex h-2.5 w-2.5 rounded-full bg-muted-foreground/40" aria-hidden />
})

// ---------------------------------------------------------------------------

const KIND_COLORS: Record<string, string> = {
  direct: 'bg-violet-500/10 text-violet-500 border-violet-500/20',
  group: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  global: 'bg-sky-500/10 text-sky-500 border-sky-500/20',
  unknown: 'bg-muted text-muted-foreground border-border',
}

type SessionCardProps = {
  session: GatewaySessionRow
  isRunning: boolean
  expanded: boolean
  onToggle: () => void
  bulkMode: boolean
  selected: boolean
  onSelect: (key: string) => void
  onHistory: (s: GatewaySessionRow) => void
  onSendMessage: (s: GatewaySessionRow) => void
  onPatch: (s: GatewaySessionRow) => void
  onDelete: (s: GatewaySessionRow) => void
  maxTokens: number
}

export const SessionCard = memo(function SessionCard({
  session,
  isRunning,
  expanded,
  onToggle,
  bulkMode,
  selected,
  onSelect,
  onHistory,
  onSendMessage,
  onPatch,
  onDelete,
  maxTokens,
}: SessionCardProps) {
  const cardRef = useRef<HTMLDivElement | null>(null)
  const agent = extractAgentId(session.key)

  useEffect(() => {
    if (expanded) cardRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [expanded])

  return (
    <div
      ref={cardRef}
      className={cn(
        'scroll-mt-24 rounded-2xl border backdrop-blur-sm transition-all duration-200',
        expanded
          ? 'relative z-20 border-primary/40 bg-card shadow-[0_10px_35px_rgba(0,0,0,0.28)] ring-1 ring-primary/20 overflow-visible'
          : 'border-border/50 bg-card/80 overflow-hidden',
      )}
    >
      <div
        className={cn(
          'flex items-center gap-3 px-4 py-3 transition-colors',
          expanded ? 'bg-muted/20' : 'hover:bg-muted/30',
        )}
      >
        {bulkMode && (
          <button
            type="button"
            aria-label={selected ? 'Deselect session' : 'Select session'}
            onClick={() => onSelect(session.key)}
            className="shrink-0"
          >
            {selected ? (
              <CheckSquare className="h-4 w-4 text-primary" />
            ) : (
              <Square className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
        )}

        <button
          type="button"
          aria-expanded={expanded}
          aria-label={`Session ${getDisplayName(session)}`}
          onClick={onToggle}
          className="min-w-0 flex flex-1 items-center gap-3 text-left"
        >
          <StatusDot isRunning={isRunning} updatedAt={session.updatedAt} />
          <span className="font-medium text-sm truncate min-w-0 flex-1">{getDisplayName(session)}</span>
          <Badge variant="outline" className={cn('text-[10px] shrink-0', KIND_COLORS[session.kind])}>
            {session.kind}
          </Badge>
          {session.surface && (
            <Badge variant="secondary" className="text-[10px] shrink-0">
              {session.surface}
            </Badge>
          )}
          {session.model && (
            <span className="text-[10px] font-mono text-muted-foreground truncate max-w-[120px] hidden sm:inline">
              {session.model}
            </span>
          )}
          {agent !== 'unknown' && (
            <Badge variant="outline" className="text-[10px] bg-pink-500/10 text-pink-500 border-pink-500/20 shrink-0">
              {agent}
            </Badge>
          )}
          {(session.totalTokens ?? 0) > 0 && (
            <span className="text-xs text-muted-foreground shrink-0">{formatTokens(session.totalTokens ?? 0)}</span>
          )}
          {session.updatedAt && (
            <span className="text-[10px] text-muted-foreground shrink-0 hidden md:inline">
              {formatRelativeTime(session.updatedAt)}
            </span>
          )}
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
        </button>
      </div>

      {!expanded && maxTokens > 0 && (session.totalTokens ?? 0) > 0 && (
        <div className="px-4 pb-2 -mt-1">
          <div className="h-1 w-full rounded-full bg-muted/40 overflow-hidden">
            <div
              className="h-full rounded-full bg-primary/40 transition-all duration-500"
              style={{ width: `${Math.min(((session.totalTokens ?? 0) / maxTokens) * 100, 100)}%` }}
            />
          </div>
        </div>
      )}

      {expanded && (
        <div className="border-t border-border/50 px-4 py-3 space-y-3">
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'Input', value: session.inputTokens },
              { label: 'Output', value: session.outputTokens },
              { label: 'Context', value: session.contextTokens },
              { label: 'Total', value: session.totalTokens },
            ].map((t) => (
              <div key={t.label} className="rounded-lg bg-muted/50 px-3 py-2 text-center">
                <div className="text-[10px] text-muted-foreground">{t.label}</div>
                <div className="text-sm font-bold">{formatTokens(t.value ?? 0)}</div>
              </div>
            ))}
          </div>

          <div className="rounded-lg bg-muted/50 px-3 py-2">
            <span className="text-[10px] text-muted-foreground">Session Key</span>
            <p className="font-mono text-xs select-all break-all">{session.key}</p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {session.thinkingLevel && (
              <Badge variant="secondary" className="text-[10px]">
                thinking: {session.thinkingLevel}
              </Badge>
            )}
            {session.reasoningLevel && (
              <Badge variant="secondary" className="text-[10px]">
                reasoning: {session.reasoningLevel}
              </Badge>
            )}
            {session.verboseLevel && (
              <Badge variant="secondary" className="text-[10px]">
                verbose: {session.verboseLevel}
              </Badge>
            )}
            {session.elevatedLevel && (
              <Badge variant="secondary" className="text-[10px]">
                elevated: {session.elevatedLevel}
              </Badge>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => onHistory(session)} aria-label="Open session history">
              <ScrollText className="h-3.5 w-3.5 mr-1.5" />
              History
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onSendMessage(session)}
              aria-label="Inject message into session"
            >
              <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
              Send
            </Button>
            <Button size="sm" variant="outline" onClick={() => onPatch(session)} aria-label="Patch session settings">
              <Settings className="h-3.5 w-3.5 mr-1.5" />
              Patch
            </Button>
            <Button size="sm" variant="destructive" onClick={() => onDelete(session)} aria-label="Delete session">
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Delete
            </Button>
          </div>
        </div>
      )}
    </div>
  )
})
