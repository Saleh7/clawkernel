import {
  Activity,
  ArrowLeftRight,
  BarChart3,
  Bot,
  Cable,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  FolderOpen,
  Layers,
  Radio,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Telescope,
  Wrench,
  Zap,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AgentActivity } from '@/app/agents/components/agent-activity'
import { AgentBindings } from '@/app/agents/components/agent-bindings'
import { AgentCard } from '@/app/agents/components/agent-card'
import { AgentChannels } from '@/app/agents/components/agent-channels'
import { AgentComparison } from '@/app/agents/components/agent-comparison'
import { AgentCron } from '@/app/agents/components/agent-cron'
import { AgentFiles } from '@/app/agents/components/agent-files'
import { AgentOverview } from '@/app/agents/components/agent-overview'
import { AgentSessions } from '@/app/agents/components/agent-sessions'
import { AgentSkills } from '@/app/agents/components/agent-skills'
import { AgentTools } from '@/app/agents/components/agent-tools'
import { TabErrorBoundary } from '@/app/agents/components/tab-error-boundary'
import { CloneAgentDialog } from '@/app/agents/dialogs/clone-agent-dialog'
import { CreateAgentDialog } from '@/app/agents/dialogs/create-agent-dialog'
import { DeleteAgentDialog } from '@/app/agents/dialogs/delete-agent-dialog'
import { resolveAgentName, resolveModelLabel } from '@/app/agents/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { resolveLiveStatus } from '@/lib/agent-status'
import type { AgentIdentityResult, AgentsListResult, ConfigSnapshot } from '@/lib/gateway/types'
import { createLogger } from '@/lib/logger'
import { ACTIVE_SESSION_MS } from '@/lib/session-constants'
import { cn } from '@/lib/utils'
import {
  selectActiveRuns,
  selectAgents,
  selectChannels,
  selectClient,
  selectIsConnected,
  useGatewayStore,
} from '@/stores/gateway-store'

type Tab = 'overview' | 'files' | 'tools' | 'skills' | 'channels' | 'cron' | 'sessions' | 'bindings' | 'activity'

import type { ParsedConfig } from './types'

const log = createLogger('agents')

type TabEntry = { id: Tab; label: string; icon: typeof BarChart3 }
type TabGroup = { label: string; tabs: TabEntry[] }

const TAB_GROUPS: TabGroup[] = [
  {
    label: 'Core',
    tabs: [
      { id: 'overview', label: 'Overview', icon: BarChart3 },
      { id: 'files', label: 'Files', icon: FolderOpen },
      { id: 'sessions', label: 'Sessions', icon: Layers },
      { id: 'activity', label: 'Activity', icon: Activity },
    ],
  },
  {
    label: 'Config',
    tabs: [
      { id: 'tools', label: 'Tools', icon: Wrench },
      { id: 'skills', label: 'Skills', icon: Zap },
      { id: 'channels', label: 'Channels', icon: Radio },
      { id: 'bindings', label: 'Bindings', icon: Cable },
      { id: 'cron', label: 'Cron', icon: Clock },
    ],
  },
]

export default function AgentsPage() {
  const connected = useGatewayStore(selectIsConnected)
  const agentsList = useGatewayStore(selectAgents)
  const client = useGatewayStore(selectClient)
  const channels = useGatewayStore(selectChannels)
  const config = useGatewayStore((s) => s.config)
  const skills = useGatewayStore((s) => s.skills)
  const sessions = useGatewayStore((s) => s.sessions)
  const cronStatus = useGatewayStore((s) => s.cronStatus)
  const cronJobs = useGatewayStore((s) => s.cronJobs)
  const activeRuns = useGatewayStore(selectActiveRuns)
  const agents = agentsList?.agents ?? []

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [refreshing, setRefreshing] = useState(false)
  const [workspace, setWorkspace] = useState<string | null>(null)
  const [identities, setIdentities] = useState<Record<string, AgentIdentityResult>>({})
  const identityFetchedRef = useRef<Set<string>>(new Set())
  const [showClone, setShowClone] = useState(false)
  const [showComparison, setShowComparison] = useState(false)
  const carouselRef = useRef<HTMLDivElement>(null)

  const firstAgentId = agents[0]?.id ?? null
  useEffect(() => {
    if (!selectedId && agentsList) {
      setSelectedId(agentsList.defaultId ?? firstAgentId)
    }
  }, [agentsList, firstAgentId, selectedId])

  // Fetch identities for all agents (from IDENTITY.md files)
  useEffect(() => {
    if (!client || agents.length === 0) return
    for (const agent of agents) {
      if (identityFetchedRef.current.has(agent.id)) continue
      identityFetchedRef.current.add(agent.id)
      client
        .request<AgentIdentityResult>('agent.identity.get', { agentId: agent.id })
        .then((r) => setIdentities((prev) => ({ ...prev, [agent.id]: r })))
        .catch((err) => log.warn(`Identity fetch failed for ${agent.id}`, err))
    }
  }, [client, agents])

  useEffect(() => {
    if (!client || config) return
    client
      .request<ConfigSnapshot>('config.get', {})
      .then((r) => useGatewayStore.getState().setConfig(r))
      .catch((err) => log.warn('Config fetch failed', err))
  }, [client, config])

  useEffect(() => {
    if (!client || !selectedId) return
    setWorkspace(null)
    client
      .request<{ agentId: string; workspace: string; files: unknown[] }>('agents.files.list', { agentId: selectedId })
      .then((r) => setWorkspace(r.workspace))
      .catch((err) => log.warn('Workspace fetch failed', err))
  }, [client, selectedId])

  const refresh = async () => {
    if (!client) return
    setRefreshing(true)
    try {
      const r = await client.request<AgentsListResult>('agents.list', {})
      useGatewayStore.getState().setAgents(r)
    } catch (err) {
      log.warn('Agents refresh failed', err)
    }
    setRefreshing(false)
  }

  const scrollCarousel = (dir: 'left' | 'right') => {
    carouselRef.current?.scrollBy({ left: dir === 'left' ? -260 : 260, behavior: 'smooth' })
  }

  const cfg = config?.config as ParsedConfig | null | undefined
  const agentsCfg = cfg?.agents
  const defaults = agentsCfg?.defaults

  const configByAgentId = useMemo(() => {
    const map = new Map<string, Record<string, unknown>>()
    for (const entry of agentsCfg?.list ?? []) {
      const id = typeof entry.id === 'string' ? entry.id : null
      if (id) map.set(id, entry)
    }
    return map
  }, [agentsCfg?.list])

  const selected = selectedId ? (agents.find((a) => a.id === selectedId) ?? null) : null

  const resolveModelForAgent = (agentId: string): string => {
    const entry = configByAgentId.get(agentId)
    return resolveModelLabel(entry?.model ?? defaults?.model)
  }

  const resolveToolProfileForAgent = (agentId: string): string => {
    const entry = configByAgentId.get(agentId)
    return ((entry?.tools as Record<string, unknown> | undefined)?.profile as string | undefined) ?? 'full'
  }

  const sessionsByAgentId = useMemo(() => {
    const map = new Map<string, { all: number; active: number; tokens: number }>()
    const now = Date.now()

    for (const agent of agents) {
      map.set(agent.id, { all: 0, active: 0, tokens: 0 })
    }

    // O(sessions) — extract agentId from session key once per session
    for (const session of sessions) {
      if (!session.key.startsWith('agent:')) continue
      const secondColon = session.key.indexOf(':', 6) // after "agent:"
      if (secondColon === -1) continue
      const agentId = session.key.slice(6, secondColon)
      const current = map.get(agentId)
      if (!current) continue
      current.all += 1
      current.tokens += session.totalTokens ?? 0
      if (session.updatedAt && now - session.updatedAt < ACTIVE_SESSION_MS) current.active += 1
    }

    return map
  }, [agents, sessions])

  const selectedName = selected ? resolveAgentName(selected, identities[selected.id]) : 'Unassigned'

  const defaultAgent = agents.find((agent) => agent.id === agentsList?.defaultId) ?? null
  const defaultAgentName = defaultAgent ? resolveAgentName(defaultAgent, identities[defaultAgent.id]) : 'None'
  const totalActiveSessions = Array.from(sessionsByAgentId.values()).reduce((sum, stat) => sum + stat.active, 0)
  if (!connected) {
    return (
      <main className="agents-shell flex-1 p-4 sm:p-6">
        <div className="agents-grid-mask" aria-hidden />
        <div className="relative z-10 flex h-full flex-col items-center justify-center text-center">
          <div className="agents-panel w-full max-w-md space-y-4 px-6 py-8">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-border/60 bg-background/70">
              <Telescope className="h-8 w-8 text-primary animate-pulse" />
            </div>
            <div>
              <p className="text-lg font-semibold tracking-tight">Agent Control Room</p>
              <p className="mt-1 text-sm text-muted-foreground">Establishing gateway connection...</p>
            </div>
            <div className="mx-auto flex items-center gap-2">
              <Skeleton className="h-2 w-10 rounded-full" />
              <Skeleton className="h-2 w-10 rounded-full" />
              <Skeleton className="h-2 w-10 rounded-full" />
            </div>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="agents-shell relative flex-1 min-h-0 overflow-hidden p-3 sm:p-6">
      <div className="agents-grid-mask" aria-hidden />

      <div className="relative z-10 flex h-full min-h-0 flex-col gap-4 sm:gap-5">
        <section className="agents-panel animate-in fade-in slide-in-from-top-2 duration-500 px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-3">
              <div className="space-y-1">
                <h1 className="text-2xl font-bold tracking-tight sm:text-[1.85rem]">Agents</h1>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <Badge variant="secondary" className="rounded-full bg-muted/70 px-3 py-1 text-[11px]">
                <Layers className="mr-1.5 h-3.5 w-3.5" />
                {agents.length} agents
              </Badge>
              <Badge variant="secondary" className="rounded-full bg-muted/70 px-3 py-1 text-[11px]">
                <Activity className="mr-1.5 h-3.5 w-3.5" />
                {totalActiveSessions} active sessions
              </Badge>
              <Badge variant="secondary" className="rounded-full bg-muted/70 px-3 py-1 text-[11px]">
                <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                default: {defaultAgentName}
              </Badge>
              {agents.length >= 2 && (
                <Button
                  size="sm"
                  variant={showComparison ? 'secondary' : 'outline'}
                  onClick={() => setShowComparison((v) => !v)}
                  className="gap-1.5 rounded-full px-3"
                >
                  <ArrowLeftRight className="h-3.5 w-3.5" />
                  Compare
                </Button>
              )}
              {selected && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowClone(true)}
                  className="gap-1.5 rounded-full px-3"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Clone
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => void refresh()}
                disabled={refreshing}
                className="gap-1.5 rounded-full px-3"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
                Refresh
              </Button>
              <CreateAgentDialog client={client} onCreated={(id) => setSelectedId(id)} />
            </div>
          </div>
        </section>

        <section className="agents-panel px-4 py-4 sm:px-5">
          <div className="mb-3 flex items-center justify-between mb-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Fleet Directory</p>
              <p className="mt-0.5 text-sm text-foreground">Choose an agent to open its focused control surface.</p>
            </div>
            {selected && (
              <Badge variant="outline" className="hidden rounded-full px-3 py-1 text-[11px] sm:inline-flex ">
                <Bot className="mr-1.5 h-3.5 w-3.5 text-primary" />
                inspecting {selectedName}
              </Badge>
            )}
          </div>

          <div className="relative">
            {agents.length > 3 && (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  className="absolute -left-1 top-1/2 z-20 hidden h-8 w-8 -translate-y-1/2 rounded-full border border-border/70 bg-background/90 p-0 shadow-sm backdrop-blur sm:flex"
                  onClick={() => scrollCarousel('left')}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="absolute -right-1 top-1/2 z-20 hidden h-8 w-8 -translate-y-1/2 rounded-full border border-border/70 bg-background/90 p-0 shadow-sm backdrop-blur sm:flex"
                  onClick={() => scrollCarousel('right')}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </>
            )}

            <div
              ref={carouselRef}
              className="flex gap-3 overflow-x-auto pb-1 pr-1 pl-1 snap-x snap-mandatory"
              style={{ scrollbarWidth: 'none' }}
            >
              {agents.length === 0 ? (
                <div className="flex-1 rounded-2xl border border-dashed border-border/70 bg-background/60 px-6 py-10 text-center">
                  <Telescope className="mx-auto h-8 w-8 text-muted-foreground/30" />
                  <p className="mt-3 text-sm text-muted-foreground">No agents configured yet</p>
                </div>
              ) : (
                agents.map((agent, index) => {
                  const stats = sessionsByAgentId.get(agent.id) ?? { all: 0, active: 0, tokens: 0 }
                  return (
                    <AgentCard
                      key={agent.id}
                      agent={agent}
                      identity={identities[agent.id]}
                      index={index}
                      isSelected={agent.id === selectedId}
                      isDefault={agent.id === agentsList?.defaultId}
                      modelLabel={resolveModelForAgent(agent.id)}
                      toolProfile={resolveToolProfileForAgent(agent.id)}
                      sessionCount={stats.all}
                      activeSessionCount={stats.active}
                      totalTokens={stats.tokens}
                      status={resolveLiveStatus(agent.id, activeRuns, sessions)}
                      onClick={() => {
                        setSelectedId(agent.id)
                        setActiveTab('overview')
                      }}
                    />
                  )
                })
              )}
            </div>
          </div>
        </section>

        {selected && !showComparison && (
          <section className="agents-panel px-3 py-3 sm:px-4">
            <div className="flex items-center gap-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
              {TAB_GROUPS.map((group, gi) => (
                <div key={group.label} className="contents">
                  {gi > 0 && <div className="mx-1.5 h-5 w-px shrink-0 bg-border/40" />}
                  {group.tabs.map((tab) => {
                    const Icon = tab.icon
                    const isActive = activeTab === tab.id
                    return (
                      <button
                        type="button"
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        data-active={isActive}
                        className="agents-tab-trigger"
                      >
                        <Icon className="h-3.5 w-3.5" />
                        <span>{tab.label}</span>
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          </section>
        )}

        {selected && !showComparison && (
          <section className="agents-tab-surface flex-1 min-h-0 animate-in fade-in duration-300">
            <TabErrorBoundary tab={activeTab} key={`${selected.id}-${activeTab}`}>
              {activeTab === 'overview' && (
                <AgentOverview
                  agent={selected}
                  agentsList={agentsList!}
                  config={config}
                  workspace={workspace}
                  sessions={sessions}
                  identity={identities[selected.id]}
                  activeRuns={activeRuns}
                  client={client}
                  deleteSlot={
                    <DeleteAgentDialog
                      agentId={selected.id}
                      agentName={selectedName}
                      isDefault={selected.id === agentsList?.defaultId}
                      client={client}
                      onDeleted={() => setSelectedId(null)}
                    />
                  }
                />
              )}
              {activeTab === 'files' && <AgentFiles agentId={selected.id} client={client} />}
              {activeTab === 'tools' && <AgentTools agentId={selected.id} config={config} client={client} />}
              {activeTab === 'skills' && (
                <AgentSkills agentId={selected.id} client={client} storeSkills={skills} config={config} />
              )}
              {activeTab === 'sessions' && (
                <AgentSessions agentId={selected.id} sessions={sessions} activeRuns={activeRuns} client={client} />
              )}
              {activeTab === 'channels' && (
                <AgentChannels
                  agentId={selected.id}
                  channels={channels}
                  config={config}
                  isDefault={selected.id === agentsList?.defaultId}
                />
              )}
              {activeTab === 'bindings' && (
                <AgentBindings
                  agentId={selected.id}
                  config={config}
                  isDefault={selected.id === agentsList?.defaultId}
                  client={client}
                />
              )}
              {activeTab === 'cron' && (
                <AgentCron agentId={selected.id} cronJobs={cronJobs} cronStatus={cronStatus} client={client} />
              )}
              {activeTab === 'activity' && <AgentActivity agentId={selected.id} client={client} />}
            </TabErrorBoundary>
          </section>
        )}

        {/* Comparison view — replaces tabs when active */}
        {showComparison && agents.length >= 2 && (
          <section className="agents-tab-surface flex-1 min-h-0 animate-in fade-in duration-300">
            <AgentComparison
              agents={agents}
              sessions={sessions}
              config={config}
              identities={identities}
              activeRuns={activeRuns}
              onClose={() => setShowComparison(false)}
            />
          </section>
        )}

        {!selected && !showComparison && agents.length > 0 && (
          <section className="agents-panel flex flex-1 items-center justify-center px-6 py-12 text-center">
            <div>
              <Sparkles className="mx-auto h-8 w-8 text-primary/55" />
              <p className="mt-3 text-sm text-muted-foreground">
                Select an agent from the fleet directory to begin inspection.
              </p>
            </div>
          </section>
        )}
      </div>

      {/* Clone Agent Dialog */}
      {selected && (
        <CloneAgentDialog
          open={showClone}
          onOpenChange={setShowClone}
          sourceAgentId={selected.id}
          sourceAgentName={selectedName}
          config={config}
          client={client}
          onCloned={(id) => setSelectedId(id)}
        />
      )}
    </main>
  )
}
