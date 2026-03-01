import { memo } from 'react'
import { Badge } from '@/components/ui/badge'
import { LIVE_STATUS_META, type LiveAgentStatus } from '@/lib/agent-status'
import { formatTokens } from '@/lib/format'
import type { AgentIdentityResult, GatewayAgentRow } from '@/lib/gateway/types'
import { cn } from '@/lib/utils'
import { resolveAgentEmoji, resolveAgentName } from '../utils'

const STATUS_META: Record<LiveAgentStatus, { label: string; color: string; pulse: boolean }> = {
  running: { label: 'Running', color: LIVE_STATUS_META.running.dotClass, pulse: true },
  active: { label: 'Active', color: LIVE_STATUS_META.active.dotClass, pulse: false },
  idle: { label: 'Idle', color: LIVE_STATUS_META.idle.dotClass, pulse: false },
  inactive: { label: 'Inactive', color: LIVE_STATUS_META.inactive.dotClass, pulse: false },
}

type AgentCardProps = {
  agent: GatewayAgentRow
  identity?: AgentIdentityResult | null
  index: number
  isSelected: boolean
  isDefault: boolean
  modelLabel: string
  toolProfile: string
  sessionCount: number
  activeSessionCount: number
  totalTokens: number
  status: LiveAgentStatus
  onClick: () => void
}

export const AgentCard = memo(function AgentCard({
  agent,
  identity,
  index,
  isSelected,
  isDefault,
  modelLabel,
  toolProfile,
  sessionCount,
  activeSessionCount,
  totalTokens,
  status,
  onClick,
}: AgentCardProps) {
  const emoji = resolveAgentEmoji(agent, identity)
  const name = resolveAgentName(agent, identity)
  const statusMeta = STATUS_META[status]

  return (
    <button
      type="button"
      onClick={onClick}
      data-selected={isSelected}
      className={cn('fleet-agent-card group animate-in fade-in slide-in-from-bottom-2 duration-500')}
      style={{ animationDelay: `${Math.min(index * 55, 330)}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-border/50 bg-background/70 text-2xl shadow-sm">
          {emoji || name.slice(0, 1)}
        </div>
        <div className="flex flex-col items-end gap-1.5">
          {isDefault && (
            <Badge
              variant="secondary"
              className="rounded-full px-2 py-0 text-[9px] font-semibold uppercase tracking-[0.12em]"
            >
              Default
            </Badge>
          )}
          <Badge variant="outline" className="rounded-full px-2 py-0 font-mono text-[10px]">
            {activeSessionCount} active
          </Badge>
        </div>
      </div>

      <div className="mt-3 space-y-1 text-left">
        <p className="truncate text-sm font-semibold tracking-tight text-foreground">{name}</p>
        <p className="truncate font-mono text-[11px] text-muted-foreground/90">{modelLabel}</p>
      </div>

      <div className="mt-3 grid gap-1.5 border-t border-border/40 pt-3 text-[10px]">
        <div className="flex items-center justify-between text-muted-foreground">
          <span className="uppercase tracking-[0.12em]">Sessions</span>
          <span className="font-mono text-foreground">{sessionCount}</span>
        </div>
        <div className="flex items-center justify-between text-muted-foreground">
          <span className="uppercase tracking-[0.12em]">Tokens</span>
          <span className="font-mono text-foreground">{formatTokens(totalTokens)}</span>
        </div>
        <div className="flex items-center justify-between text-muted-foreground">
          <span className="uppercase tracking-[0.12em]">Tool Profile</span>
          <span className="font-mono text-foreground">{toolProfile}</span>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between border-t border-border/30 pt-2 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className={cn('h-2 w-2 rounded-full', statusMeta.color, statusMeta.pulse && 'animate-pulse')} />
          {statusMeta.label}
        </span>
        {isSelected && <span className="h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-primary/20" />}
      </div>
    </button>
  )
})
