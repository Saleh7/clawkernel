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
  readonly agents: GatewayAgentRow[]
  readonly sessions: GatewaySessionRow[]
  readonly config: ConfigSnapshot | null
  readonly identities: Record<string, AgentIdentityResult>
  readonly activeRuns: Record<string, { sessionKey: string; startedAt: number }>
  readonly onClose: () => void
}

import type { ParsedConfig } from '../types'

function sessionBelongsToAgent(key: string, agentId: string): boolean {
  return key.startsWith(`agent:${agentId}:`)
}

function computeAgentStatus(hasActiveRun: boolean, activeSessions: number, totalSessions: number): string {
  if (hasActiveRun) return 'running'
  if (activeSessions > 0) return 'active'
  if (totalSessions > 0) return 'idle'
  return 'inactive'
}

type SessionStats = {
  readonly agentSessions: GatewaySessionRow[]
  readonly activeSessions: GatewaySessionRow[]
  readonly totalTokens: number
  readonly hasActiveRun: boolean
}

function computeSessionStats(
  sessions: GatewaySessionRow[],
  agentId: string,
  activeRuns: Record<string, { sessionKey: string; startedAt: number }>,
): SessionStats {
  const now = Date.now()
  const agentSessions = sessions.filter((s) => sessionBelongsToAgent(s.key, agentId))
  const activeSessions = agentSessions.filter((s) => s.updatedAt && now - s.updatedAt < ACTIVE_SESSION_MS)
  const totalTokens = agentSessions.reduce((sum, s) => sum + (s.totalTokens ?? 0), 0)
  const hasActiveRun = Object.values(activeRuns).some((r) => sessionBelongsToAgent(r.sessionKey, agentId))
  return { agentSessions, activeSessions, totalTokens, hasActiveRun }
}

type AgentDataResult = {
  readonly agent: GatewayAgentRow
  readonly identity: AgentIdentityResult | undefined
  readonly model: string
  readonly sessionCount: number
  readonly activeCount: number
  readonly totalTokens: number
  readonly toolProfile: string
  readonly skills: string[] | null | undefined
  readonly status: string
  readonly workspace: string
}

function computeAgentData(
  agentId: string | null,
  agents: GatewayAgentRow[],
  sessions: GatewaySessionRow[],
  cfg: ParsedConfig | null | undefined,
  identities: Record<string, AgentIdentityResult>,
  activeRuns: Record<string, { sessionKey: string; startedAt: number }>,
): AgentDataResult | null {
  if (!agentId) return null
  const agent = agents.find((a) => a.id === agentId)
  if (!agent) return null

  const identity = identities[agentId]
  const agentConfig = cfg?.agents?.list?.find((a) => a.id === agentId)
  const defaults = cfg?.agents?.defaults

  const { agentSessions, activeSessions, totalTokens, hasActiveRun } = computeSessionStats(
    sessions,
    agentId,
    activeRuns,
  )

  const model = agentConfig?.model ?? defaults?.model
  const toolProfile = agentConfig?.tools?.profile ?? defaults?.tools?.profile ?? 'full'
  const skills = agentConfig?.skills
  const workspace = agentConfig?.workspace ?? defaults?.workspace
  const status = computeAgentStatus(hasActiveRun, activeSessions.length, agentSessions.length)

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


function agentIdentityLabel(d: AgentDataResult | null | undefined): string | undefined {
  if (!d) return undefined
  return `${d.identity?.emoji ?? ''} ${d.identity?.name ?? d.agent.id}`.trim()
}

function formatSkillPolicy(d: AgentDataResult | null | undefined): string | undefined {
  if (!d) return undefined
  return d.skills === null || d.skills === undefined ? 'all enabled' : `${d.skills.length} filtered`
}

function agentStatusBadge(status: string) {
  const colors: Record<string, string> = {
    running: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
    active: 'border-green-500/30 bg-green-500/10 text-green-400',
    idle: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
    inactive: 'border-border bg-muted/30 text-muted-foreground',
  }
  return (
    <Badge variant="outline" className={cn('rounded-full text-[10px]', colors[status] ?? '')}>
      {status === 'running' && (
        <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
      )}
      {status}
    </Badge>
  )
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
  readonly agents: GatewayAgentRow[]
  readonly identities: Record<string, AgentIdentityResult>
  readonly selected: string | null
  readonly onSelect: (id: string) => void
  readonly label: string
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
  readonly label: string
  readonly valueA?: string
  readonly valueB?: string
  readonly renderA?: React.ReactNode
  readonly renderB?: React.ReactNode
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
//  AgentColumnHeader
// ---------------------------------------------------------------------------

function AgentColumnHeader({ d }: { readonly d: AgentDataResult | null }) {
  if (!d) return <span className="text-sm text-muted-foreground/50">Not selected</span>
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border/40 bg-background/60 text-lg">
        {d.identity?.emoji || d.agent.id.slice(0, 1)}
      </div>
      <div>
        <p className="text-sm font-semibold">{d.identity?.name || d.agent.id}</p>
        <p className="font-mono text-[10px] text-muted-foreground">{d.agent.id}</p>
      </div>
    </div>
  )
}

export function AgentComparison({ agents, sessions, config, identities, activeRuns, onClose }: Props) {
  const [agentAId, setAgentAId] = useState<string | null>(agents[0]?.id ?? null)
  const [agentBId, setAgentBId] = useState<string | null>(agents[1]?.id ?? null)

  const cfg = config?.config as ParsedConfig | null | undefined

  const dataA = useMemo(
    () => computeAgentData(agentAId, agents, sessions, cfg, identities, activeRuns),
    [agentAId, agents, sessions, cfg, identities, activeRuns],
  )
  const dataB = useMemo(
    () => computeAgentData(agentBId, agents, sessions, cfg, identities, activeRuns),
    [agentBId, agents, sessions, cfg, identities, activeRuns],
  )

  const renderAModel = dataA ? <span className="font-mono text-xs">{dataA.model}</span> : undefined
  const renderBModel = dataB ? <span className="font-mono text-xs">{dataB.model}</span> : undefined
  const renderASessions = dataA ? (
    <span>
      {dataA.sessionCount} total · <span className="text-emerald-400">{dataA.activeCount} active</span>
    </span>
  ) : undefined
  const renderBSessions = dataB ? (
    <span>
      {dataB.sessionCount} total · <span className="text-emerald-400">{dataB.activeCount} active</span>
    </span>
  ) : undefined
  const renderATokens = dataA ? <span className="font-mono">{formatTokens(dataA.totalTokens)}</span> : undefined
  const renderBTokens = dataB ? <span className="font-mono">{formatTokens(dataB.totalTokens)}</span> : undefined
  const renderAStatus = dataA ? agentStatusBadge(dataA.status) : undefined
  const renderBStatus = dataB ? agentStatusBadge(dataB.status) : undefined
  const renderAWorkspace = dataA ? <span className="font-mono text-xs">{dataA.workspace}</span> : undefined
  const renderBWorkspace = dataB ? <span className="font-mono text-xs">{dataB.workspace}</span> : undefined

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
        <AgentColumnHeader d={dataA} />
        <AgentColumnHeader d={dataB} />
      </div>

      <Separator className="opacity-30" />

      {/* Comparison rows */}
      <div className="space-y-0.5">
        <ComparisonRow label="Identity" valueA={agentIdentityLabel(dataA)} valueB={agentIdentityLabel(dataB)} />
        <ComparisonRow
          label="Model"
          valueA={dataA?.model}
          valueB={dataB?.model}
          renderA={renderAModel}
          renderB={renderBModel}
        />
        <ComparisonRow
          label="Sessions"
          valueA={dataA ? `${dataA.sessionCount}t/${dataA.activeCount}a` : undefined}
          valueB={dataB ? `${dataB.sessionCount}t/${dataB.activeCount}a` : undefined}
          renderA={renderASessions}
          renderB={renderBSessions}
        />
        <ComparisonRow
          label="Token Usage"
          valueA={dataA ? String(dataA.totalTokens) : undefined}
          valueB={dataB ? String(dataB.totalTokens) : undefined}
          renderA={renderATokens}
          renderB={renderBTokens}
        />
        <ComparisonRow label="Tool Profile" valueA={dataA?.toolProfile} valueB={dataB?.toolProfile} />
        <ComparisonRow label="Skill Policy" valueA={formatSkillPolicy(dataA)} valueB={formatSkillPolicy(dataB)} />
        <ComparisonRow
          label="Status"
          valueA={dataA?.status}
          valueB={dataB?.status}
          renderA={renderAStatus}
          renderB={renderBStatus}
        />
        <ComparisonRow
          label="Workspace"
          valueA={dataA?.workspace}
          valueB={dataB?.workspace}
          renderA={renderAWorkspace}
          renderB={renderBWorkspace}
        />
      </div>
    </div>
  )
}
