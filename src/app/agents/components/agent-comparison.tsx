import { ArrowLeftRight, ChevronDown, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { formatTokens } from '@/lib/format'
import type { AgentIdentityResult, ConfigSnapshot, GatewayAgentRow, GatewaySessionRow } from '@/lib/gateway/types'
import { ACTIVE_SESSION_MS } from '@/lib/session-constants'
import { cn } from '@/lib/utils'
import { resolveModelLabel } from '../utils'

// ---------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------

type Props = {
  agents: GatewayAgentRow[]
  sessions: GatewaySessionRow[]
  config: ConfigSnapshot | null
  identities: Record<string, AgentIdentityResult>
  activeRuns: Record<string, { sessionKey: string; startedAt: number }>
  onClose: () => void
}

import type { ParsedConfig } from '../types'

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

function sessionBelongsToAgent(key: string, agentId: string): boolean {
  return key.startsWith(`agent:${agentId}:`)
}

// ---------------------------------------------------------------------------
//  AgentSelector
// ---------------------------------------------------------------------------

function AgentSelector({
  agents,
  identities,
  selected,
  onSelect,
  label,
}: {
  agents: GatewayAgentRow[]
  identities: Record<string, AgentIdentityResult>
  selected: string | null
  onSelect: (id: string) => void
  label: string
}) {
  const [open, setOpen] = useState(false)
  const identity = selected ? identities[selected] : null
  const name = identity?.name || selected || 'Select agent'
  const emoji = identity?.emoji || ''

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg border border-border/50 bg-background/50 px-3 py-1.5 text-sm hover:bg-accent/50 transition-colors min-w-[160px]"
      >
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}:</span>
        {selected ? (
          <>
            {emoji && <span>{emoji}</span>}
            <span className="truncate font-medium text-foreground">{name}</span>
          </>
        ) : (
          <span className="text-muted-foreground">Select agent</span>
        )}
        <ChevronDown className="ml-auto h-3.5 w-3.5 text-muted-foreground/50" />
      </button>
      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 w-56 rounded-lg border border-border/50 bg-popover p-1 shadow-lg backdrop-blur-sm">
          {agents.map((a) => {
            const ident = identities[a.id]
            return (
              <button
                type="button"
                key={a.id}
                onClick={() => {
                  onSelect(a.id)
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm hover:bg-accent/50 transition-colors',
                  selected === a.id && 'bg-accent',
                )}
              >
                <span>{ident?.emoji || '🤖'}</span>
                <span className="truncate">{ident?.name || a.id}</span>
                <span className="ml-auto font-mono text-[10px] text-muted-foreground">{a.id}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
//  ComparisonRow
// ---------------------------------------------------------------------------

function ComparisonRow({
  label,
  valueA,
  valueB,
  renderA,
  renderB,
}: {
  label: string
  valueA?: string
  valueB?: string
  renderA?: React.ReactNode
  renderB?: React.ReactNode
}) {
  const isDifferent = valueA !== valueB

  return (
    <div
      className={cn(
        'grid grid-cols-[140px_1fr_1fr] items-center gap-4 rounded-lg px-4 py-3 transition-colors',
        'max-sm:grid-cols-1 max-sm:gap-1',
        isDifferent && 'bg-primary/[0.04]',
      )}
    >
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <div className="text-sm text-foreground max-sm:pl-4">{renderA ?? valueA ?? '—'}</div>
      <div className="text-sm text-foreground max-sm:pl-4">{renderB ?? valueB ?? '—'}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
//  AgentComparison — main export
// ---------------------------------------------------------------------------

export function AgentComparison({ agents, sessions, config, identities, activeRuns, onClose }: Props) {
  const [agentAId, setAgentAId] = useState<string | null>(agents[0]?.id ?? null)
  const [agentBId, setAgentBId] = useState<string | null>(agents[1]?.id ?? null)

  const cfg = config?.config as ParsedConfig | null | undefined

  const getAgentData = useMemo(() => {
    const now = Date.now()
    return (agentId: string | null) => {
      if (!agentId) return null
      const agent = agents.find((a) => a.id === agentId)
      if (!agent) return null

      const identity = identities[agentId]
      const agentConfig = cfg?.agents?.list?.find((a) => a.id === agentId)
      const defaults = cfg?.agents?.defaults

      const agentSessions = sessions.filter((s) => sessionBelongsToAgent(s.key, agentId))
      const activeSessions = agentSessions.filter((s) => s.updatedAt && now - s.updatedAt < ACTIVE_SESSION_MS)
      const totalTokens = agentSessions.reduce((sum, s) => sum + (s.totalTokens ?? 0), 0)

      const model = agentConfig?.model ?? defaults?.model
      const toolProfile = agentConfig?.tools?.profile ?? defaults?.tools?.profile ?? 'full'
      const skills = agentConfig?.skills
      const workspace = agentConfig?.workspace ?? defaults?.workspace

      const hasActiveRun = Object.values(activeRuns).some((r) => sessionBelongsToAgent(r.sessionKey, agentId))
      const status = hasActiveRun
        ? 'running'
        : activeSessions.length > 0
          ? 'active'
          : agentSessions.length > 0
            ? 'idle'
            : 'inactive'

      return {
        agent,
        identity,
        model: resolveModelLabel(model),
        sessionCount: agentSessions.length,
        activeCount: activeSessions.length,
        totalTokens,
        toolProfile,
        skills,
        status,
        workspace: workspace ?? '—',
      }
    }
  }, [agents, sessions, cfg, identities, activeRuns])

  const dataA = getAgentData(agentAId)
  const dataB = getAgentData(agentBId)

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      running: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
      active: 'border-green-500/30 bg-green-500/10 text-green-400',
      idle: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
      inactive: 'border-border bg-muted/30 text-muted-foreground',
    }
    return (
      <Badge variant="outline" className={cn('rounded-full text-[10px]', colors[status] || '')}>
        {status === 'running' && (
          <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
        )}
        {status}
      </Badge>
    )
  }

  const skillLabel = (skills: string[] | undefined | null) =>
    skills === null || skills === undefined ? 'all enabled' : `${skills.length} filtered`

  return (
    <div className="rounded-2xl border border-border/50 bg-card/80 backdrop-blur-sm p-5 sm:p-6 space-y-4">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 mr-auto">
          <ArrowLeftRight className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold tracking-tight">Compare Agents</h2>
        </div>
        <AgentSelector agents={agents} identities={identities} selected={agentAId} onSelect={setAgentAId} label="A" />
        <AgentSelector agents={agents} identities={identities} selected={agentBId} onSelect={setAgentBId} label="B" />
        <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <Separator className="opacity-40" />

      {/* Column headers */}
      <div className="grid grid-cols-[140px_1fr_1fr] gap-4 px-4 max-sm:hidden">
        <div />
        {[dataA, dataB].map((d, i) => (
          <div key={i} className="flex items-center gap-2.5">
            {d ? (
              <>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border/40 bg-background/60 text-lg">
                  {d.identity?.emoji || d.agent.id.slice(0, 1)}
                </div>
                <div>
                  <p className="text-sm font-semibold">{d.identity?.name || d.agent.id}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">{d.agent.id}</p>
                </div>
              </>
            ) : (
              <span className="text-sm text-muted-foreground/50">Not selected</span>
            )}
          </div>
        ))}
      </div>

      <Separator className="opacity-30" />

      {/* Comparison rows */}
      <div className="space-y-0.5">
        <ComparisonRow
          label="Identity"
          valueA={dataA ? `${dataA.identity?.emoji || ''} ${dataA.identity?.name || dataA.agent.id}`.trim() : undefined}
          valueB={dataB ? `${dataB.identity?.emoji || ''} ${dataB.identity?.name || dataB.agent.id}`.trim() : undefined}
        />
        <ComparisonRow
          label="Model"
          valueA={dataA?.model}
          valueB={dataB?.model}
          renderA={dataA ? <span className="font-mono text-xs">{dataA.model}</span> : undefined}
          renderB={dataB ? <span className="font-mono text-xs">{dataB.model}</span> : undefined}
        />
        <ComparisonRow
          label="Sessions"
          valueA={dataA ? `${dataA.sessionCount}t/${dataA.activeCount}a` : undefined}
          valueB={dataB ? `${dataB.sessionCount}t/${dataB.activeCount}a` : undefined}
          renderA={
            dataA ? (
              <span>
                {dataA.sessionCount} total · <span className="text-emerald-400">{dataA.activeCount} active</span>
              </span>
            ) : undefined
          }
          renderB={
            dataB ? (
              <span>
                {dataB.sessionCount} total · <span className="text-emerald-400">{dataB.activeCount} active</span>
              </span>
            ) : undefined
          }
        />
        <ComparisonRow
          label="Token Usage"
          valueA={dataA ? String(dataA.totalTokens) : undefined}
          valueB={dataB ? String(dataB.totalTokens) : undefined}
          renderA={dataA ? <span className="font-mono">{formatTokens(dataA.totalTokens)}</span> : undefined}
          renderB={dataB ? <span className="font-mono">{formatTokens(dataB.totalTokens)}</span> : undefined}
        />
        <ComparisonRow label="Tool Profile" valueA={dataA?.toolProfile} valueB={dataB?.toolProfile} />
        <ComparisonRow
          label="Skill Policy"
          valueA={dataA ? skillLabel(dataA.skills) : undefined}
          valueB={dataB ? skillLabel(dataB.skills) : undefined}
        />
        <ComparisonRow
          label="Status"
          valueA={dataA?.status}
          valueB={dataB?.status}
          renderA={dataA ? statusBadge(dataA.status) : undefined}
          renderB={dataB ? statusBadge(dataB.status) : undefined}
        />
        <ComparisonRow
          label="Workspace"
          valueA={dataA?.workspace}
          valueB={dataB?.workspace}
          renderA={dataA ? <span className="font-mono text-xs">{dataA.workspace}</span> : undefined}
          renderB={dataB ? <span className="font-mono text-xs">{dataB.workspace}</span> : undefined}
        />
      </div>
    </div>
  )
}
