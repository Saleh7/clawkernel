import { Activity, Bot, DollarSign, Layers, Server, Timer, Wifi } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router'
import { Separator } from '@/components/ui/separator'
import { useTimeFormat } from '@/hooks/use-time-format'
import { formatTokens } from '@/lib/format'
import {
  selectAgents,
  selectChannels,
  selectIsConnected,
  selectPresence,
  selectSessions,
  useGatewayStore,
} from '@/stores/gateway-store'
import { MetricTile } from './components/metric-tile'
import { PresenceCard } from './components/presence-card'
import { QuickActions } from './components/quick-actions'
import { SessionsCard } from './components/sessions-card'
import { useDashboard } from './hooks/use-dashboard'

function latencyStatus(ms: number): 'success' | 'warning' | 'error' {
  if (ms < 50) return 'success'
  if (ms < 200) return 'warning'
  return 'error'
}

function channelsMetricStatus(connected: number, total: number): 'success' | 'warning' | 'error' {
  if (connected === total) return 'success'
  if (connected > 0) return 'warning'
  return 'error'
}

function cronMetricStatus(failingJobs: number, cronEnabled: boolean | undefined): 'success' | 'error' | undefined {
  if (failingJobs > 0) return 'error'
  return cronEnabled ? 'success' : undefined
}

export default function DashboardPage() {
  const connected = useGatewayStore(selectIsConnected)
  const agentsList = useGatewayStore(selectAgents)
  const sessions = useGatewayStore(selectSessions)
  const channelsSnapshot = useGatewayStore(selectChannels)
  const presence = useGatewayStore(selectPresence)
  const cronJobs = useGatewayStore((s) => s.cronJobs)
  const cronStatus = useGatewayStore((s) => s.cronStatus)

  const { latencyMs, todayCost } = useDashboard()
  const { is24h } = useTimeFormat()

  const agents = agentsList?.agents ?? []
  const channels = channelsSnapshot?.channelOrder ?? []
  const channelAccounts = channelsSnapshot?.channelAccounts ?? {}

  const connectedChannels = useMemo(
    () => channels.filter((ch) => (channelAccounts[ch] ?? []).some((a) => a.connected || a.running)),
    [channels, channelAccounts],
  )

  const presenceEntries = useMemo(() => Object.values(presence), [presence])

  const directCount = useMemo(() => sessions.filter((s) => s.kind === 'direct').length, [sessions])

  const failingJobs = useMemo(
    () => cronJobs.filter((j) => j.enabled && j.state?.lastStatus === 'error').length,
    [cronJobs],
  )

  const enabledJobs = useMemo(() => cronJobs.filter((j) => j.enabled).length, [cronJobs])

  const hasLatency = latencyMs !== null && latencyMs !== undefined
  const latencyValue = hasLatency ? `${latencyMs}ms` : '—'
  const latencyTone = hasLatency ? latencyStatus(latencyMs) : undefined

  return (
    <main className="flex-1 space-y-4 p-3 sm:space-y-6 sm:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold tracking-tight sm:text-xl">Dashboard</h1>
        <QuickActions />
      </div>

      {/* Metric Tiles */}
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-6">
        <MetricTile
          icon={Wifi}
          label="Gateway"
          value={connected ? 'Connected' : 'Offline'}
          status={connected ? 'success' : 'error'}
        />
        <MetricTile icon={Activity} label="Latency" value={latencyValue} status={latencyTone} />
        <MetricTile
          icon={Bot}
          label="Agents"
          value={String(agents.length)}
          sub={`${agentsList?.defaultId ?? '—'} default`}
        />
        <MetricTile icon={Layers} label="Sessions" value={String(sessions.length)} sub={`${directCount} direct`} />
        <MetricTile
          icon={Server}
          label="Channels"
          value={`${connectedChannels.length}/${channels.length}`}
          sub="connected"
          status={channelsMetricStatus(connectedChannels.length, channels.length)}
        />
        <MetricTile
          icon={Timer}
          label="Cron"
          value={cronStatus?.enabled ? `${enabledJobs} active` : 'Disabled'}
          sub={failingJobs > 0 ? `${failingJobs} failing` : undefined}
          status={cronMetricStatus(failingJobs, cronStatus?.enabled)}
        />
      </section>

      {/* Today's Cost */}
      {todayCost && todayCost.totalCost > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-card/50 px-4 py-2.5 backdrop-blur-sm">
          <DollarSign className="h-4 w-4 text-primary" />
          <span className="text-xs font-medium">Today&apos;s Cost</span>
          <span className="font-mono text-sm font-bold">${todayCost.totalCost.toFixed(4)}</span>
          <span className="text-[10px] text-muted-foreground">({formatTokens(todayCost.totalTokens)} tokens)</span>
          <Link to="/usage" className="ml-auto text-[10px] text-primary hover:underline">
            View details →
          </Link>
        </div>
      )}

      <Separator className="opacity-30" />

      <SessionsCard sessions={sessions} connected={connected} is24h={is24h} />

      <PresenceCard entries={presenceEntries} />
    </main>
  )
}
