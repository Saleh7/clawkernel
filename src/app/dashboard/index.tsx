import { Bot, Clock, Hash, Layers, MessageSquare, Radio, Server, Wifi } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import {
  selectAgents,
  selectChannels,
  selectIsConnected,
  selectPresence,
  selectSessions,
  useGatewayStore,
} from '@/stores/gateway-store'

export default function DashboardPage() {
  const connected = useGatewayStore(selectIsConnected)
  const agentsList = useGatewayStore(selectAgents)
  const sessions = useGatewayStore(selectSessions)
  const channelsSnapshot = useGatewayStore(selectChannels)
  const presence = useGatewayStore(selectPresence)

  const agents = agentsList?.agents ?? []
  const channels = channelsSnapshot?.channelOrder ?? []
  const channelAccounts = channelsSnapshot?.channelAccounts ?? {}
  const connectedChannels = channels.filter((ch) => {
    const accounts = channelAccounts[ch] ?? []
    return accounts.some((a) => a.connected || a.running)
  })
  const presenceEntries = Object.values(presence)

  return (
    <main className="flex-1 space-y-4 p-3 sm:space-y-6 sm:p-6">
      {/* Overview Metrics */}
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
        <MetricTile
          icon={Wifi}
          label="Gateway"
          value={connected ? 'Connected' : 'Offline'}
          status={connected ? 'success' : 'error'}
        />
        <MetricTile
          icon={Bot}
          label="Agents"
          value={String(agents.length)}
          sub={`${agentsList?.defaultId ?? '—'} default`}
        />
        <MetricTile
          icon={Layers}
          label="Sessions"
          value={String(sessions.length)}
          sub={`${sessions.filter((s) => s.kind === 'direct').length} direct`}
        />
        <MetricTile
          icon={Server}
          label="Channels"
          value={`${connectedChannels.length}/${channels.length}`}
          sub="connected"
          status={
            connectedChannels.length === channels.length
              ? 'success'
              : connectedChannels.length > 0
                ? 'warning'
                : 'error'
          }
        />
      </section>

      <Separator className="opacity-30" />

      {/* Sessions */}
      <Card className="border-border/50 bg-card/50 shadow-sm backdrop-blur-sm dark:shadow-none">
        <CardHeader className="px-3 pb-2 pt-3 sm:px-6 sm:pb-3 sm:pt-6">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Layers className="h-4 w-4 text-primary" /> Sessions
            <span className="ml-auto font-mono text-xs text-muted-foreground">{sessions.length} total</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-1 pb-2 sm:px-3 sm:pb-4">
          {sessions.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              {connected ? 'No active sessions' : 'Connecting...'}
            </p>
          ) : (
            <div className="grid gap-0.5 sm:grid-cols-2 lg:grid-cols-3">
              {sessions.slice(0, 9).map((s) => (
                <div key={s.key} className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-accent/50 sm:px-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-xs font-semibold sm:text-sm">
                        {s.displayName ?? s.label ?? s.key.split(':').pop()}
                      </span>
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[8px] sm:text-[9px]',
                          s.kind === 'direct'
                            ? 'border-success/20 bg-success/10 text-success'
                            : s.kind === 'group'
                              ? 'border-chart-2/20 bg-chart-2/10 text-chart-2'
                              : 'border-border bg-muted text-muted-foreground',
                        )}
                      >
                        {s.kind}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      {s.surface && (
                        <span className="flex items-center gap-0.5">
                          <Hash className="h-2.5 w-2.5" />
                          {s.surface}
                        </span>
                      )}
                      {s.totalTokens != null && s.totalTokens > 0 && (
                        <span className="flex items-center gap-0.5">
                          <MessageSquare className="h-2.5 w-2.5" />
                          {(s.totalTokens / 1000).toFixed(1)}k
                        </span>
                      )}
                      {s.updatedAt && (
                        <span className="flex items-center gap-0.5">
                          <Clock className="h-2.5 w-2.5" />
                          {new Date(s.updatedAt).toLocaleTimeString('en-US', {
                            hour12: false,
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Presence */}
      {presenceEntries.length > 0 && (
        <Card className="border-border/50 bg-card/50 shadow-sm backdrop-blur-sm dark:shadow-none">
          <CardHeader className="px-3 pb-2 pt-3 sm:px-6 sm:pb-3 sm:pt-6">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Radio className="h-4 w-4 text-primary" /> Presence
              <span className="ml-auto font-mono text-xs text-muted-foreground">
                {presenceEntries.length} connected
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-1 pb-2 sm:px-3 sm:pb-4">
            <div className="grid gap-0.5 sm:grid-cols-2 lg:grid-cols-3">
              {presenceEntries.map((p, i) => (
                <div
                  key={p.instanceId ?? i}
                  className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-accent/50 sm:px-3"
                >
                  <div className="h-2 w-2 rounded-full bg-success" />
                  <div className="min-w-0 flex-1 text-xs">
                    <span className="font-semibold">{p.host ?? 'unknown'}</span>
                    <span className="text-muted-foreground">
                      {' '}
                      · {p.platform ?? '—'} · {p.mode ?? '—'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </main>
  )
}

function MetricTile({
  icon: Icon,
  label,
  value,
  sub,
  status,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  sub?: string
  status?: 'success' | 'warning' | 'error'
}) {
  const color =
    status === 'error'
      ? 'text-destructive'
      : status === 'warning'
        ? 'text-warning'
        : status === 'success'
          ? 'text-success'
          : 'text-foreground'
  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardContent className="flex items-center gap-3 p-3 sm:p-4">
        <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg bg-accent sm:h-10 sm:w-10', color)}>
          <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className={cn('font-mono text-base font-bold sm:text-lg', color)}>{value}</div>
          {sub && <div className="text-[9px] text-muted-foreground">{sub}</div>}
        </div>
      </CardContent>
    </Card>
  )
}
