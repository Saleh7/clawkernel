import { Link2, Radio, Unlink, Wifi, WifiOff } from 'lucide-react'
import { useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import type { ChannelAccountSnapshot, ChannelsStatusSnapshot, ConfigSnapshot } from '@/lib/gateway/types'
import { cn } from '@/lib/utils'
import type { AgentBinding, ParsedConfig } from '../types'
import { AgentStatPill } from './agent-stat-pill'
import { AgentTabEmptyState } from './agent-tab-empty-state'

type Props = {
  readonly agentId: string
  readonly channels: ChannelsStatusSnapshot | null
  readonly config: ConfigSnapshot | null
  readonly isDefault: boolean
}

function summarize(accounts: ChannelAccountSnapshot[]) {
  let connected = 0,
    configured = 0,
    enabled = 0
  for (const a of accounts) {
    if (a.connected || a.running) connected++
    if (a.configured) configured++
    if (a.enabled) enabled++
  }
  return { total: accounts.length, connected, configured, enabled }
}

function formatBinding(b: AgentBinding): string {
  const parts: string[] = []
  if (b.match.accountId) parts.push(`account: ${b.match.accountId}`)
  if (b.match.peer) parts.push(`${b.match.peer.kind}:${b.match.peer.id}`)
  if (b.match.guildId) parts.push(`guild: ${b.match.guildId}`)
  if (b.match.teamId) parts.push(`team: ${b.match.teamId}`)
  if (b.match.roles?.length) parts.push(`roles: ${b.match.roles.join(', ')}`)
  return parts.length > 0 ? parts.join(' · ') : 'all traffic'
}

function channelBorderClass(allConnected: boolean, partial: boolean): string {
  if (allConnected) return 'border-green-500/20 bg-card/80 backdrop-blur-sm'
  if (partial) return 'border-yellow-500/20 bg-card/80 backdrop-blur-sm'
  return 'border-border/50 bg-card/60'
}

function iconBoxClass(allConnected: boolean, partial: boolean): string {
  if (allConnected) return 'bg-green-500/10'
  if (partial) return 'bg-yellow-500/10'
  return 'bg-muted/50'
}

function barClass(allConnected: boolean, partial: boolean): string {
  if (allConnected) return 'bg-green-500/60'
  if (partial) return 'bg-yellow-500/60'
  return 'bg-muted-foreground/10'
}

function dotClass(allConnected: boolean, partial: boolean): string {
  if (allConnected) return 'bg-green-500 animate-pulse'
  if (partial) return 'bg-yellow-500'
  return 'bg-muted-foreground/20'
}

function ChannelCard({
  channelId,
  label,
  accounts,
  bindings,
  isDefault,
}: {
  readonly channelId: string
  readonly label: string
  readonly accounts: ChannelAccountSnapshot[]
  readonly bindings: AgentBinding[]
  readonly isDefault: boolean
}) {
  const s = summarize(accounts)
  const allConnected = s.connected === s.total && s.total > 0
  const partial = s.connected > 0 && s.connected < s.total
  const ratio = s.total > 0 ? (s.connected / s.total) * 100 : 0

  const isBound = bindings.length > 0
  const receivesTraffic = isBound || isDefault

  let connectivityIcon: React.ReactNode
  if (allConnected) {
    connectivityIcon = <Wifi className="h-6 w-6 text-green-500" />
  } else if (s.connected > 0) {
    connectivityIcon = <Wifi className="h-6 w-6 text-yellow-500" />
  } else {
    connectivityIcon = <WifiOff className="h-6 w-6 text-muted-foreground/40" />
  }

  return (
    <div
      className={cn(
        'rounded-2xl border p-5 transition-all duration-200 hover:scale-[1.01]',
        channelBorderClass(allConnected, partial),
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div
          className={cn('flex h-12 w-12 items-center justify-center rounded-xl', iconBoxClass(allConnected, partial))}
        >
          {connectivityIcon}
        </div>
        <div className="flex items-center gap-2">
          {receivesTraffic ? (
            <Badge
              variant="outline"
              className={cn(
                'rounded-full px-2 py-0 text-[9px] font-medium',
                isBound ? 'border-primary/30 text-primary' : 'border-muted-foreground/30 text-muted-foreground',
              )}
            >
              <Link2 className="mr-1 h-2.5 w-2.5" />
              {isBound ? 'bound' : 'default'}
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="rounded-full px-2 py-0 text-[9px] text-muted-foreground/50 border-border/30"
            >
              <Unlink className="mr-1 h-2.5 w-2.5" />
              unbound
            </Badge>
          )}
          <span className={cn('h-3 w-3 rounded-full', dotClass(allConnected, partial))} />
        </div>
      </div>

      {/* Name */}
      <p className="text-sm font-semibold text-foreground">{label}</p>
      <p className="font-mono text-[10px] text-muted-foreground/40 mt-0.5">{channelId}</p>

      {/* Connection bar */}
      <div className="mt-3 h-1.5 rounded-full bg-muted/30 overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500', barClass(allConnected, partial))}
          style={{ width: `${Math.max(ratio, 2)}%` }}
        />
      </div>

      {/* Stats */}
      <div className="flex gap-3 mt-3">
        <div>
          <p className="text-xs font-bold text-foreground">{s.connected}</p>
          <p className="text-[9px] text-muted-foreground/40">Connected</p>
        </div>
        <div>
          <p className="text-xs font-bold text-foreground">{s.configured}</p>
          <p className="text-[9px] text-muted-foreground/40">Configured</p>
        </div>
        <div>
          <p className="text-xs font-bold text-foreground">{s.enabled}</p>
          <p className="text-[9px] text-muted-foreground/40">Enabled</p>
        </div>
      </div>

      {/* Bindings detail */}
      {bindings.length > 0 && (
        <>
          <Separator className="my-3 opacity-30" />
          <div className="space-y-1.5">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/50">
              Bindings ({bindings.length})
            </p>
            {bindings.map((b) => {
              const bindingText = formatBinding(b)
              return (
                <div
                  key={`${channelId}-${bindingText}`}
                  className="rounded-md border border-border/30 bg-background/40 px-2.5 py-1.5 text-[10px] font-mono text-muted-foreground"
                >
                  {bindingText}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

export function AgentChannels({ agentId, channels, config, isDefault }: Props) {
  const agentBindings = useMemo(() => {
    const cfg = config?.config as ParsedConfig | null | undefined
    const bindings = cfg?.bindings ?? []
    return bindings.filter((b): b is AgentBinding => b.agentId === agentId && typeof b.match?.channel === 'string')
  }, [config, agentId])

  const bindingsByChannel = useMemo(() => {
    const map = new Map<string, AgentBinding[]>()
    for (const b of agentBindings) {
      const ch = b.match.channel.toLowerCase()
      const list = map.get(ch) ?? []
      list.push(b)
      map.set(ch, list)
    }
    return map
  }, [agentBindings])

  const boundChannelIds = useMemo(() => new Set(bindingsByChannel.keys()), [bindingsByChannel])

  if (!channels) {
    return <AgentTabEmptyState icon={Radio} title="No channel data available" description="Waiting for gateway data…" />
  }

  const ids = channels.channelOrder?.length ? channels.channelOrder : Object.keys(channels.channelAccounts ?? {})

  if (ids.length === 0) {
    return <AgentTabEmptyState icon={Radio} title="No channels configured" />
  }

  // Sort: bound channels first, then connected, then rest
  const sortedIds = [...ids].sort((a, b) => {
    const aBound = boundChannelIds.has(a.toLowerCase()) ? 1 : 0
    const bBound = boundChannelIds.has(b.toLowerCase()) ? 1 : 0
    if (aBound !== bBound) return bBound - aBound

    const aAccounts = channels.channelAccounts?.[a] ?? []
    const bAccounts = channels.channelAccounts?.[b] ?? []
    const aConnected = aAccounts.filter((x) => x.connected || x.running).length
    const bConnected = bAccounts.filter((x) => x.connected || x.running).length
    return bConnected - aConnected
  })

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex flex-wrap items-center gap-2">
        <AgentStatPill icon={Radio} value={ids.length} label="channels" />
        <AgentStatPill
          icon={Link2}
          value={agentBindings.length}
          label="bindings"
          iconClassName="text-primary"
          valueClassName="text-primary"
        />
        {isDefault && (
          <Badge variant="secondary" className="rounded-full text-[10px]">
            Default agent — receives unbound traffic
          </Badge>
        )}
      </div>

      {/* Channel grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sortedIds.map((id) => {
          const accounts = channels.channelAccounts?.[id] ?? []
          const label = channels.channelLabels?.[id] ?? id
          const bindings = bindingsByChannel.get(id.toLowerCase()) ?? []

          return (
            <ChannelCard
              key={id}
              channelId={id}
              label={label}
              accounts={accounts}
              bindings={bindings}
              isDefault={isDefault}
            />
          )
        })}
      </div>
    </div>
  )
}
