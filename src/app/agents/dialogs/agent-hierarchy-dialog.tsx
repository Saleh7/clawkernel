import { Bot, Cable, Copy, Hash, Network, ShieldCheck, Sparkles, Users, Wallet } from 'lucide-react'
import { useMemo } from 'react'
import type { AgentBinding, ParsedConfig } from '@/app/agents/types'
import {
  channelIcon,
  formatAgo,
  formatTokens,
  resolveAgentEmoji,
  resolveAgentName,
  resolveModelLabel,
  shortPath,
} from '@/app/agents/utils'
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { LIVE_STATUS_META, type LiveAgentStatus } from '@/lib/agent-status'
import type { AgentIdentityResult, GatewayAgentRow } from '@/lib/gateway/types'
import { cn } from '@/lib/utils'

// -- Types --------------------------------------------------------------------

type AgentSessionStats = {
  count: number
  activeCount: number
  tokens: number
  lastActive: number | null
}

type AgentHierarchyDialogProps = Readonly<{
  open: boolean
  onOpenChange: (open: boolean) => void
  agent: GatewayAgentRow
  identity?: AgentIdentityResult | null
  stats: AgentSessionStats
  status: LiveAgentStatus
  config: ParsedConfig | null | undefined
  isDefault: boolean
  parentAgentId?: string | null
  childAgentIds: string[]
  agentBindings: AgentBinding[]
}>

type SectionProps = Readonly<{
  title: string
  icon: typeof Bot
  children: React.ReactNode
  className?: string
}>

function isDefined<T>(value: T | null | undefined): value is T {
  return value != null
}

function getBindingKey(binding: AgentBinding): string {
  return [
    binding.agentId,
    binding.match.channel,
    binding.match.accountId ?? '',
    binding.match.peer?.kind ?? '',
    binding.match.peer?.id ?? '',
    binding.match.guildId ?? '',
    binding.match.teamId ?? '',
    (binding.match.roles ?? []).join(','),
  ].join(':')
}

// -- Components ---------------------------------------------------------------

function Section({ title, icon: Icon, children, className }: SectionProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {title}
      </div>
      <div className="rounded-lg border border-border/60 bg-muted/30 p-3">{children}</div>
    </div>
  )
}

// -- Main Dialog --------------------------------------------------------------

export function AgentHierarchyDialog({
  open,
  onOpenChange,
  agent,
  identity,
  stats,
  status,
  config,
  isDefault,
  parentAgentId,
  childAgentIds,
  agentBindings,
}: AgentHierarchyDialogProps) {
  const agentsCfg = config?.agents
  const defaults = agentsCfg?.defaults
  const agentEntry = useMemo(() => agentsCfg?.list?.find((a) => a.id === agent.id), [agentsCfg?.list, agent.id])

  const modelLabel = resolveModelLabel(agentEntry?.model ?? defaults?.model ?? 'unassigned')
  const toolProfile =
    ((agentEntry?.tools as Record<string, unknown> | undefined)?.profile as string | undefined) ?? 'full'
  const workspace = agentEntry?.workspace ?? `~/.openclaw/workspace-${agent.id}`

  const parentAgent = useMemo(
    () => (parentAgentId ? agentsCfg?.list?.find((a) => a.id === parentAgentId) : null),
    [agentsCfg?.list, parentAgentId],
  )

  const childAgents = useMemo(
    () =>
      childAgentIds
        .map((id) => agentsCfg?.list?.find((a) => a.id === id))
        .filter(isDefined)
        .map((childAgent) => ({ id: childAgent.id, name: resolveAgentName(childAgent) })),
    [agentsCfg?.list, childAgentIds],
  )

  const emoji = resolveAgentEmoji(agent, identity)
  const name = resolveAgentName(agent, identity)
  const statusMeta = LIVE_STATUS_META[status]

  const copyAgentId = () => {
    navigator.clipboard.writeText(agent.id)
  }

  if (!open) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-hidden p-0">
        <DialogHeader className="border-b border-border/60 px-5 py-4">
          <div className="flex items-start gap-3 pr-8">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
              <span className="text-2xl">{emoji || '🤖'}</span>
            </div>
            <div className="min-w-0">
              <DialogTitle className="flex items-center gap-2 text-lg">
                <span className="truncate">{name}</span>
                {isDefault && (
                  <span className="flex shrink-0 items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                    <ShieldCheck className="h-3 w-3" />
                    Default
                  </span>
                )}
              </DialogTitle>
              <button
                type="button"
                onClick={copyAgentId}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                title="Copy ID"
              >
                <Hash className="h-3 w-3" />
                <span className="max-w-[200px] truncate">{agent.id}</span>
                <Copy className="h-3 w-3 opacity-50" />
              </button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-4">
            {/* Identity Section */}
            <Section title="Identity" icon={Bot}>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span
                      className={cn('h-2 w-2 rounded-full', statusMeta.dotClass, statusMeta.pulse && 'animate-pulse')}
                    />
                    <span className="font-medium">{statusMeta.label}</span>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Type</p>
                  <p className="mt-0.5 font-medium">Agent</p>
                </div>
              </div>
            </Section>

            {/* Activity Section */}
            <Section title="Activity" icon={Sparkles}>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Sessions</p>
                  <p className="mt-0.5 text-lg font-semibold">{stats.count}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Tokens</p>
                  <p className="mt-0.5 text-lg font-semibold">{formatTokens(stats.tokens)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Last Active</p>
                  <p className="mt-0.5 text-sm font-medium">{formatAgo(stats.lastActive)}</p>
                </div>
              </div>
            </Section>

            {/* Config Section */}
            <Section title="Configuration" icon={Wallet}>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Model</span>
                  <span className="font-mono text-xs">{modelLabel}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tool Profile</span>
                  <span className="font-medium">{toolProfile}</span>
                </div>
                <div className="flex justify-between items-start gap-2">
                  <span className="text-muted-foreground">Workspace</span>
                  <span className="font-mono text-xs text-right max-w-[60%] break-all">{shortPath(workspace)}</span>
                </div>
              </div>
            </Section>

            {/* Channel Bindings Section */}
            <Section title="Channel Bindings" icon={Cable}>
              {agentBindings.length === 0 ? (
                <p className="text-sm text-muted-foreground">No bindings configured</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {agentBindings.map((binding) => (
                    <span
                      key={getBindingKey(binding)}
                      className="inline-flex items-center gap-1 rounded bg-sky-500/10 px-2 py-1 text-xs font-medium text-sky-300"
                    >
                      <span>{channelIcon(binding.match?.channel ?? 'unknown')}</span>
                      <span className="capitalize">{binding.match?.channel ?? 'unknown'}</span>
                      {binding.match?.accountId && (
                        <span className="text-sky-400/60">:{String(binding.match.accountId).slice(0, 8)}</span>
                      )}
                    </span>
                  ))}
                </div>
              )}
            </Section>

            {/* Delegation Section */}
            <Section title="Delegation" icon={Network}>
              <div className="space-y-2 text-sm">
                {parentAgent ? (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Parent Agent</span>
                    <span className="font-medium">{resolveAgentName(parentAgent)}</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Parent Agent</span>
                    <span className="text-muted-foreground">None (top-level)</span>
                  </div>
                )}
                <div>
                  <p className="text-muted-foreground mb-1.5">Sub-agents</p>
                  {childAgents.length === 0 ? (
                    <p className="text-muted-foreground">None</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {childAgents.map((child) => (
                        <span
                          key={child.id}
                          className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-300"
                        >
                          <Users className="h-3 w-3" />
                          {child.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </Section>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border/60 px-5 py-3">
          <DialogClose asChild>
            <button type="button" className="rounded-lg px-4 py-2 text-sm font-medium hover:bg-muted">
              Close
            </button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  )
}
