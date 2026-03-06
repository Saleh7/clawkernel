import {
  Background,
  Controls,
  type Edge,
  Handle,
  MarkerType,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from '@xyflow/react'
import dagre from 'dagre'
import { FolderOpen, Grid3X3, LayoutGrid, Network, Radio, RotateCcw, Warehouse } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TabErrorBoundary } from '@/app/agents/components/tab-error-boundary'
import { AgentHierarchyDialog } from '@/app/agents/dialogs/agent-hierarchy-dialog'
import type { AgentBinding, ParsedConfig } from '@/app/agents/types'
import {
  channelIcon,
  computeAgentSessionStats,
  formatAgo,
  formatTokens,
  resolveAgentEmoji,
  resolveAgentName,
  resolveModelLabel,
  shortPath,
} from '@/app/agents/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { LIVE_STATUS_META, type LiveAgentStatus } from '@/lib/agent-status'
import type { AgentIdentityResult, GatewayAgentRow } from '@/lib/gateway/types'
import { ACTIVE_SESSION_MS } from '@/lib/session-constants'
import { cn } from '@/lib/utils'

import '@xyflow/react/dist/style.css'

// -- Types --------------------------------------------------------------------

type AgentNodeData = {
  agent: GatewayAgentRow
  identity?: AgentIdentityResult | null
  selected: boolean
  onClick: () => void
  onViewDetails: () => void
  sessionCount: number
  totalTokens: number
  lastActive: number | null
  modelLabel: string
  isDefault: boolean
  status: LiveAgentStatus
  statusMeta: (typeof LIVE_STATUS_META)['active']
}

type ChannelNodeData = {
  channel: string
  accountIds: string[]
}

type WorkspaceNodeData = {
  path: string
  agentNames: string[]
  selected?: boolean
  onClick?: () => void
}

type GatewayNodeData = {
  agentCount: number
}

type AgentConfigEntry = NonNullable<NonNullable<ParsedConfig['agents']>['list']>[number]
type AgentSession = { key: string; totalTokens?: number; updatedAt: number | null }
type ActiveRunMap = Record<string, { sessionKey: string; startedAt: number }>
type XYPosition = { x: number; y: number }
type PositionResolver = (nodeId: string, fallbackX: number, fallbackY: number) => XYPosition

// -- Constants ----------------------------------------------------------------

const NODE_WIDTH = 240
const NODE_HEIGHT = 110
const GATEWAY_NODE_WIDTH = 160
const GATEWAY_NODE_HEIGHT = 80
const CHANNEL_NODE_WIDTH = 140
const CHANNEL_NODE_HEIGHT = 60
const WORKSPACE_NODE_WIDTH = 180
const WORKSPACE_NODE_HEIGHT = 70

const DELEGATION_COLOR = 'var(--delegation-color, #10b981)'
const ROUTE_COLOR = 'var(--route-color, #3b82f6)'
const WORKSPACE_COLOR = 'var(--workspace-color, #f59e0b)'

// Layout fallback positions
const FALLBACK_AGENT_X = 320
const FALLBACK_CHANNEL_X = -350
const FALLBACK_WORKSPACE_X = 650

// Layout persistence key
const LAYOUT_STORAGE_KEY = 'clawkernel-hierarchy-layout'

// -- Layout Modes -------------------------------------------------------------

/** Layout mode for hierarchy view */
type LayoutMode = 'compact' | 'balanced' | 'delegation' | 'channel' | 'workspace'

/** Layout mode metadata for UI */
const LAYOUT_MODE_INFO: Record<LayoutMode, { label: string; icon: typeof LayoutGrid; description: string }> = {
  compact: { label: 'Compact', icon: LayoutGrid, description: 'Shortest height, adaptive columns' },
  balanced: { label: 'Balanced', icon: Grid3X3, description: 'Clean edge crossing for medium fleets' },
  delegation: { label: 'Delegation', icon: Network, description: 'Parent/child visual clarity' },
  channel: { label: 'Channel', icon: Radio, description: 'Routing/binding analysis' },
  workspace: { label: 'Workspace', icon: Warehouse, description: 'Ownership and workspace clarity' },
}

// -- Layout Computation Functions ---------------------------------------------

interface LayoutInput {
  agents: GatewayAgentRow[]
  config: ParsedConfig | null | undefined
  channelList: Array<[string, Set<string>]>
  workspaceList: Array<[string, string[]]>
  defaultAgentId?: string | null
  getSubagents: (agentId: string) => string[]
  getWorkspace: (agentId: string) => string
}

type NodePositions = Map<string, { x: number; y: number }>

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function createAgentConfigMap(config: ParsedConfig | null | undefined): Map<string, AgentConfigEntry> {
  return new Map((config?.agents?.list ?? []).map((entry) => [entry.id, entry]))
}

function resolveSubagentIds(subagents: AgentConfigEntry['subagents']): string[] {
  if (isStringArray(subagents)) return subagents
  const allowAgents = subagents && !Array.isArray(subagents) ? subagents.allowAgents : undefined
  return isStringArray(allowAgents) ? allowAgents : []
}

function createWorkspaceResolver(agentConfigMap: ReadonlyMap<string, AgentConfigEntry>) {
  return (agentId: string): string => agentConfigMap.get(agentId)?.workspace ?? `~/.openclaw/workspace-${agentId}`
}

function createSubagentResolver(agentConfigMap: ReadonlyMap<string, AgentConfigEntry>) {
  return (agentId: string): string[] => resolveSubagentIds(agentConfigMap.get(agentId)?.subagents)
}

function hasActiveAgentRun(agentId: string, activeRuns: ActiveRunMap): boolean {
  return Object.values(activeRuns).some((run) => run.sessionKey.startsWith(`agent:${agentId}:`))
}

function createLayoutGraph(config: dagre.GraphLabel): dagre.graphlib.Graph {
  const dagreGraph = new dagre.graphlib.Graph()
  dagreGraph.setGraph(config)
  dagreGraph.setDefaultEdgeLabel(() => ({}))
  return dagreGraph
}

function addGatewayNode(dagreGraph: dagre.graphlib.Graph) {
  dagreGraph.setNode('gateway', { width: GATEWAY_NODE_WIDTH, height: GATEWAY_NODE_HEIGHT })
}

function addChannelNodes(
  dagreGraph: dagre.graphlib.Graph,
  channelList: LayoutInput['channelList'],
  width = CHANNEL_NODE_WIDTH,
  height = CHANNEL_NODE_HEIGHT,
) {
  for (const [channel] of channelList) {
    dagreGraph.setNode(`ch-${channel}`, { width, height })
  }
}

function addAgentNodes(
  dagreGraph: dagre.graphlib.Graph,
  agents: GatewayAgentRow[],
  getNodeOptions: (agent: GatewayAgentRow, index: number) => Record<string, number | string | undefined> = () => ({
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  }),
) {
  agents.forEach((agent, index) => {
    dagreGraph.setNode(`agent-${agent.id}`, getNodeOptions(agent, index))
  })
}

function addWorkspaceNodes(
  dagreGraph: dagre.graphlib.Graph,
  workspaceList: LayoutInput['workspaceList'],
  width = WORKSPACE_NODE_WIDTH,
  height = WORKSPACE_NODE_HEIGHT,
) {
  for (let i = 0; i < workspaceList.length; i++) {
    dagreGraph.setNode(`ws-${i}`, { width, height })
  }
}

function connectChannelsToGateway(dagreGraph: dagre.graphlib.Graph, channelList: LayoutInput['channelList']) {
  for (const [channel] of channelList) {
    dagreGraph.setEdge(`ch-${channel}`, 'gateway')
  }
}

function connectGatewayToAgents(dagreGraph: dagre.graphlib.Graph, agents: GatewayAgentRow[]) {
  for (const agent of agents) {
    dagreGraph.setEdge('gateway', `agent-${agent.id}`)
  }
}

function connectDelegationEdges(
  dagreGraph: dagre.graphlib.Graph,
  agents: GatewayAgentRow[],
  getSubagents: LayoutInput['getSubagents'],
) {
  const agentIds = new Set(agents.map((agent) => agent.id))
  for (const agent of agents) {
    for (const subId of getSubagents(agent.id)) {
      if (subId !== agent.id && agentIds.has(subId)) {
        dagreGraph.setEdge(`agent-${agent.id}`, `agent-${subId}`)
      }
    }
  }
}

function connectWorkspaceEdges(
  dagreGraph: dagre.graphlib.Graph,
  agents: GatewayAgentRow[],
  workspaceList: LayoutInput['workspaceList'],
  getWorkspace: LayoutInput['getWorkspace'],
) {
  workspaceList.forEach(([workspace], index) => {
    for (const agent of agents) {
      if (getWorkspace(agent.id) === workspace) {
        dagreGraph.setEdge(`agent-${agent.id}`, `ws-${index}`)
      }
    }
  })
}

function connectChannelBindingEdges(
  dagreGraph: dagre.graphlib.Graph,
  channelList: LayoutInput['channelList'],
  bindings: AgentBinding[],
) {
  for (const [channel] of channelList) {
    const boundAgents = bindings
      .filter((binding) => binding.match?.channel === channel)
      .map((binding) => binding.agentId)
    for (const agentId of boundAgents) {
      dagreGraph.setEdge(`ch-${channel}`, `agent-${agentId}`)
    }
  }
}

function collectChildAgentIds(agents: GatewayAgentRow[], getSubagents: LayoutInput['getSubagents']): Set<string> {
  const childIds = new Set<string>()
  const agentIds = new Set(agents.map((agent) => agent.id))
  for (const agent of agents) {
    for (const subId of getSubagents(agent.id)) {
      if (subId !== agent.id && agentIds.has(subId)) {
        childIds.add(subId)
      }
    }
  }
  return childIds
}

function collectChannelData(bindings: AgentBinding[]) {
  const channelMap = new Map<string, Set<string>>()
  const channelRoutes = new Map<string, string[]>()

  for (const binding of bindings) {
    const channel = binding.match?.channel
    if (!channel) continue

    const accountId = binding.match?.accountId
    if (!channelMap.has(channel)) channelMap.set(channel, new Set())
    if (accountId) channelMap.get(channel)?.add(accountId)
    if (!channelRoutes.has(channel)) channelRoutes.set(channel, [])
    channelRoutes.get(channel)?.push(binding.agentId)
  }

  return {
    channelList: Array.from(channelMap.entries()),
    channelRoutes,
  }
}

function collectWorkspaceData(
  agents: GatewayAgentRow[],
  identities: Record<string, AgentIdentityResult>,
  getWorkspace: (agentId: string) => string,
) {
  const workspaceMap = new Map<string, string[]>()

  for (const agent of agents) {
    const workspace = getWorkspace(agent.id)
    const agentName = resolveAgentName(agent, identities[agent.id])
    if (!workspaceMap.has(workspace)) workspaceMap.set(workspace, [])
    workspaceMap.get(workspace)?.push(agentName)
  }

  return Array.from(workspaceMap.entries())
}

/** Compact Grid: Gateway left, channels left-middle, agents 2-4 columns, workspaces right */
function layoutCompactGrid(input: LayoutInput): NodePositions {
  const { agents, channelList, workspaceList, getSubagents, getWorkspace } = input
  const positions = new Map<string, { x: number; y: number }>()

  const dagreGraph = createLayoutGraph({
    rankdir: 'LR',
    nodesep: 40,
    ranksep: 100,
    marginx: 30,
    marginy: 20,
  })
  addGatewayNode(dagreGraph)
  addChannelNodes(dagreGraph, channelList)
  addAgentNodes(dagreGraph, agents, () => ({ width: NODE_WIDTH, height: NODE_HEIGHT * 0.8 }))
  addWorkspaceNodes(dagreGraph, workspaceList)
  connectChannelsToGateway(dagreGraph, channelList)
  connectGatewayToAgents(dagreGraph, agents)
  connectDelegationEdges(dagreGraph, agents, getSubagents)
  connectWorkspaceEdges(dagreGraph, agents, workspaceList, getWorkspace)

  dagre.layout(dagreGraph)
  return extractPositions(dagreGraph, positions)
}

/** Balanced Columns: Gateway center-left, agents split into two columns, workspaces right */
function layoutBalancedColumns(input: LayoutInput): NodePositions {
  const { agents, channelList, workspaceList, getSubagents, getWorkspace } = input
  const positions = new Map<string, { x: number; y: number }>()
  const mid = Math.ceil(agents.length / 2)

  const dagreGraph = createLayoutGraph({
    rankdir: 'LR',
    nodesep: 60,
    ranksep: 180,
    marginx: 40,
    marginy: 30,
  })
  addGatewayNode(dagreGraph)
  addChannelNodes(dagreGraph, channelList)
  addAgentNodes(dagreGraph, agents, (_agent, index) => ({
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    rank: index < mid ? undefined : 1,
  }))
  addWorkspaceNodes(dagreGraph, workspaceList)
  connectChannelsToGateway(dagreGraph, channelList)
  connectGatewayToAgents(dagreGraph, agents)
  connectDelegationEdges(dagreGraph, agents, getSubagents)
  connectWorkspaceEdges(dagreGraph, agents, workspaceList, getWorkspace)

  dagre.layout(dagreGraph)
  return extractPositions(dagreGraph, positions)
}

/** Delegation Focus: Parent agents in main column, child agents offset near parent */
function layoutDelegationFocus(input: LayoutInput): NodePositions {
  const { agents, channelList, workspaceList, getSubagents, getWorkspace } = input
  const positions = new Map<string, { x: number; y: number }>()

  const dagreGraph = createLayoutGraph({
    rankdir: 'TB',
    nodesep: 50,
    ranksep: 120,
    marginx: 40,
    marginy: 30,
  })
  const childIds = collectChildAgentIds(agents, getSubagents)
  const parentAgents = agents.filter((agent) => !childIds.has(agent.id))
  const childAgents = agents.filter((agent) => childIds.has(agent.id))

  addGatewayNode(dagreGraph)
  addChannelNodes(dagreGraph, channelList)
  addAgentNodes(dagreGraph, parentAgents)
  addAgentNodes(dagreGraph, childAgents)
  addWorkspaceNodes(dagreGraph, workspaceList)
  connectChannelsToGateway(dagreGraph, channelList)
  connectGatewayToAgents(dagreGraph, agents)
  connectDelegationEdges(dagreGraph, agents, getSubagents)
  connectWorkspaceEdges(dagreGraph, agents, workspaceList, getWorkspace)

  dagre.layout(dagreGraph)
  return extractPositions(dagreGraph, positions)
}

/** Channel Focus: Channels expanded/grouped on left, agents grouped by channel affinity */
function layoutChannelFocus(input: LayoutInput): NodePositions {
  const { agents, channelList, workspaceList, config, getSubagents, getWorkspace } = input
  const positions = new Map<string, { x: number; y: number }>()

  const dagreGraph = createLayoutGraph({
    rankdir: 'LR',
    nodesep: 45,
    ranksep: 140,
    marginx: 30,
    marginy: 25,
  })
  addGatewayNode(dagreGraph)
  addChannelNodes(dagreGraph, channelList, CHANNEL_NODE_WIDTH * 1.2, CHANNEL_NODE_HEIGHT * 1.1)
  addAgentNodes(dagreGraph, agents)
  addWorkspaceNodes(dagreGraph, workspaceList)
  connectChannelsToGateway(dagreGraph, channelList)
  connectChannelBindingEdges(dagreGraph, channelList, config?.bindings ?? [])
  connectGatewayToAgents(dagreGraph, agents)
  connectDelegationEdges(dagreGraph, agents, getSubagents)
  connectWorkspaceEdges(dagreGraph, agents, workspaceList, getWorkspace)

  dagre.layout(dagreGraph)
  return extractPositions(dagreGraph, positions)
}

/** Workspace Focus: Agents grouped by workspace clusters, workspace nodes emphasized */
function layoutWorkspaceFocus(input: LayoutInput): NodePositions {
  const { agents, channelList, workspaceList, getSubagents, getWorkspace } = input
  const positions = new Map<string, { x: number; y: number }>()

  const dagreGraph = createLayoutGraph({
    rankdir: 'LR',
    nodesep: 50,
    ranksep: 150,
    marginx: 35,
    marginy: 25,
  })
  addGatewayNode(dagreGraph)
  addChannelNodes(dagreGraph, channelList)
  addAgentNodes(dagreGraph, agents)
  addWorkspaceNodes(dagreGraph, workspaceList, WORKSPACE_NODE_WIDTH * 1.15, WORKSPACE_NODE_HEIGHT * 1.1)
  connectChannelsToGateway(dagreGraph, channelList)
  connectGatewayToAgents(dagreGraph, agents)
  connectDelegationEdges(dagreGraph, agents, getSubagents)
  connectWorkspaceEdges(dagreGraph, agents, workspaceList, getWorkspace)

  dagre.layout(dagreGraph)
  return extractPositions(dagreGraph, positions)
}

/** Extract positions from dagre graph (caller must have already run dagre.layout) */
function extractPositions(dagreGraph: dagre.graphlib.Graph, positions: NodePositions): NodePositions {
  for (const nodeId of dagreGraph.nodes()) {
    const node = dagreGraph.node(nodeId)
    if (node && typeof node.x === 'number' && typeof node.y === 'number') {
      positions.set(nodeId, {
        x: node.x - (node.width ?? 200) / 2,
        y: node.y - (node.height ?? 100) / 2,
      })
    }
  }
  return positions
}

/** Compute layout based on mode */
function computeLayout(mode: LayoutMode, input: LayoutInput): NodePositions {
  switch (mode) {
    case 'compact':
      return layoutCompactGrid(input)
    case 'balanced':
      return layoutBalancedColumns(input)
    case 'delegation':
      return layoutDelegationFocus(input)
    case 'channel':
      return layoutChannelFocus(input)
    case 'workspace':
      return layoutWorkspaceFocus(input)
    default:
      return layoutCompactGrid(input)
  }
}

// -- Helpers ------------------------------------------------------------------

function shortModel(m: string): string {
  const parts = m.split('/')
  return parts.at(-1) ?? m
}

/** Derive agent status from active runs and last active time */
function deriveAgentStatus(
  agentId: string,
  activeRuns: ActiveRunMap,
  lastActive: number | null,
): { status: LiveAgentStatus; statusMeta: (typeof LIVE_STATUS_META)['active'] } {
  if (hasActiveAgentRun(agentId, activeRuns)) {
    return { status: 'running', statusMeta: LIVE_STATUS_META.running }
  }

  if (!lastActive) {
    return { status: 'inactive', statusMeta: LIVE_STATUS_META.inactive }
  }

  const now = Date.now()
  const isRecent = now - lastActive < ACTIVE_SESSION_MS
  return isRecent
    ? { status: 'active', statusMeta: LIVE_STATUS_META.active }
    : { status: 'idle', statusMeta: LIVE_STATUS_META.idle }
}

// -- Node Components ----------------------------------------------------------

function GatewayNode({ data }: NodeProps) {
  const d = data as GatewayNodeData
  return (
    <div className="flex flex-col items-center">
      <Handle type="target" position={Position.Left} className="!bg-transparent !border-0 !w-0 !h-0" />
      <Handle type="source" position={Position.Right} className="!bg-transparent !border-0 !w-0 !h-0" />
      <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-primary/30 bg-primary/10 shadow-lg">
        <span className="text-xl">🦞</span>
      </div>
      <div className="mt-2 text-center">
        <p className="text-xs font-bold text-foreground">Gateway</p>
        <p className="text-xs text-muted-foreground">
          {d.agentCount} agent{d.agentCount === 1 ? '' : 's'}
        </p>
      </div>
    </div>
  )
}

function AgentNodeComponent({ data }: NodeProps) {
  const d = data as AgentNodeData
  const {
    agent,
    selected,
    onClick,
    onViewDetails,
    sessionCount,
    totalTokens,
    lastActive,
    modelLabel,
    isDefault,
    statusMeta,
  } = d

  const emoji = resolveAgentEmoji(agent, d.identity)
  const name = resolveAgentName(agent, d.identity)

  const handleClick = () => {
    onClick()
    onViewDetails()
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        'cursor-pointer rounded-xl border p-3 transition-all min-w-44 max-w-52 text-left w-full',
        selected
          ? 'border-primary/50 bg-primary/10 shadow-lg shadow-primary/10'
          : 'border-border bg-card hover:border-primary/30',
      )}
    >
      <Handle type="target" position={Position.Left} className="!bg-primary !border-primary !w-2 !h-2" />
      <Handle type="source" position={Position.Right} className="!bg-blue-500 !border-blue-400 !w-2 !h-2" />

      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/20 text-sm font-bold">
          {emoji || '🤖'}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-xs font-semibold text-foreground">{name}</span>
            <span className={cn('h-2 w-2 rounded-full', statusMeta.dotClass, statusMeta.pulse && 'animate-pulse')} />
          </div>
          <p className="truncate text-xs text-muted-foreground">{shortModel(modelLabel)}</p>
        </div>
      </div>

      {/* Badges */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
        {isDefault && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary font-medium">◇ Default</span>}
      </div>

      {/* Stats row */}
      <div className="mt-2 flex items-center gap-3 border-t border-foreground/5 pt-2 text-xs">
        <span className="text-muted-foreground">
          Sessions <strong className="text-foreground/70">{sessionCount}</strong>
        </span>
        <span className="text-muted-foreground">
          Tokens <strong className="text-foreground/70">{formatTokens(totalTokens)}</strong>
        </span>
        <span className={cn('ml-auto font-medium', statusMeta.dotClass.replace('bg-', 'text-'))}>
          {formatAgo(lastActive)}
        </span>
      </div>
    </button>
  )
}

function ChannelNodeComponent({ data }: NodeProps) {
  const d = data as ChannelNodeData

  return (
    <div className="flex items-center gap-2 rounded-lg border border-sky-500/20 bg-sky-950/50 px-3 py-2 min-w-32">
      <Handle type="source" position={Position.Right} className="!bg-sky-500 !border-sky-400 !w-2 !h-2" />
      <span className="text-sm">{channelIcon(d.channel)}</span>
      <div>
        <p className="text-xs font-semibold text-sky-200 capitalize">{d.channel}</p>
        {d.accountIds.length > 0 && <p className="text-xs text-sky-400/60">{d.accountIds.join(', ')}</p>}
      </div>
    </div>
  )
}

function WorkspaceNodeComponent({ data }: NodeProps) {
  const d = data as WorkspaceNodeData

  return (
    <button
      type="button"
      onClick={d.onClick}
      className={cn(
        'flex items-center gap-2 rounded-lg border px-3 py-2 min-w-32 text-left',
        d.selected
          ? 'border-amber-400/50 bg-amber-900/50 shadow-lg shadow-amber-500/10'
          : 'border-amber-500/20 bg-amber-950/40 hover:border-amber-400/40',
      )}
    >
      <Handle type="target" position={Position.Left} className="!bg-amber-500 !border-amber-400 !w-2 !h-2" />
      <FolderOpen className="h-4 w-4 text-amber-400 shrink-0" />
      <div>
        <p className="text-xs font-semibold text-amber-200">{shortPath(d.path)}</p>
        <p className="text-xs text-amber-400/60">{d.agentNames.join(', ')}</p>
      </div>
    </button>
  )
}

const nodeTypes = {
  gateway: GatewayNode,
  agent: AgentNodeComponent,
  channel: ChannelNodeComponent,
  workspace: WorkspaceNodeComponent,
}

// -- Graph Builder ------------------------------------------------------------

interface BuildGraphParams {
  agents: GatewayAgentRow[]
  identities: Record<string, AgentIdentityResult>
  config: ParsedConfig | null | undefined
  sessions: AgentSession[]
  activeRuns: ActiveRunMap
  selectedAgentId: string | null
  onSelectAgent: (id: string) => void
  onViewDetails: (agentId: string) => void
  onWorkspaceClick: (path: string) => void
  defaultAgentId?: string | null
  layoutMode: LayoutMode
}

function buildGatewayNodeElement(agentCount: number, position: XYPosition): Node {
  return {
    id: 'gateway',
    type: 'gateway',
    position,
    data: { agentCount },
    draggable: true,
  }
}

interface BuildAgentElementsParams {
  agents: GatewayAgentRow[]
  identities: Record<string, AgentIdentityResult>
  agentConfigMap: ReadonlyMap<string, AgentConfigEntry>
  defaultModel: unknown
  sessionsByAgentId: ReturnType<typeof computeAgentSessionStats>
  activeRuns: ActiveRunMap
  selectedAgentId: string | null
  onSelectAgent: (id: string) => void
  onViewDetails: (agentId: string) => void
  defaultAgentId?: string | null
  getPos: PositionResolver
}

function buildAgentElements({
  agents,
  identities,
  agentConfigMap,
  defaultModel,
  sessionsByAgentId,
  activeRuns,
  selectedAgentId,
  onSelectAgent,
  onViewDetails,
  defaultAgentId,
  getPos,
}: BuildAgentElementsParams): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = []
  const edges: Edge[] = []

  for (const agent of agents) {
    const nodeId = `agent-${agent.id}`
    const stats = sessionsByAgentId.get(agent.id) ?? { count: 0, activeCount: 0, tokens: 0, lastActive: null }
    const modelLabel = resolveModelLabel(agentConfigMap.get(agent.id)?.model ?? defaultModel)
    const isDefault = agent.id === defaultAgentId
    const { status, statusMeta } = deriveAgentStatus(agent.id, activeRuns, stats.lastActive)

    nodes.push({
      id: nodeId,
      type: 'agent',
      position: getPos(nodeId, FALLBACK_AGENT_X, 0),
      data: {
        agent,
        identity: identities[agent.id],
        selected: selectedAgentId === agent.id,
        onClick: () => onSelectAgent(agent.id),
        onViewDetails: () => onViewDetails(agent.id),
        sessionCount: stats.count,
        totalTokens: stats.tokens,
        lastActive: stats.lastActive,
        modelLabel,
        isDefault,
        status,
        statusMeta,
      },
      draggable: true,
    })

    edges.push({
      id: `gw-${agent.id}`,
      source: 'gateway',
      target: nodeId,
      type: 'default',
      style: { stroke: 'var(--border)', strokeWidth: 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--border)', width: 18, height: 14 },
    })
  }

  return { nodes, edges }
}

function buildDelegationEdgeElements(agents: GatewayAgentRow[], getSubagents: (agentId: string) => string[]): Edge[] {
  const edges: Edge[] = []
  const agentIds = new Set(agents.map((agent) => agent.id))
  const delegationEdgeStyle = {
    stroke: DELEGATION_COLOR,
    strokeWidth: 1.5,
    strokeDasharray: '5 4',
  }

  for (const agent of agents) {
    for (const subId of getSubagents(agent.id)) {
      if (subId === agent.id || !agentIds.has(subId)) continue
      edges.push({
        id: `delegate-${agent.id}-${subId}`,
        source: `agent-${agent.id}`,
        target: `agent-${subId}`,
        type: 'default',
        animated: true,
        style: delegationEdgeStyle,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: DELEGATION_COLOR,
          width: 14,
          height: 10,
        },
      })
    }
  }

  return edges
}

interface BuildChannelElementsParams {
  channelList: Array<[string, Set<string>]>
  channelRoutes: ReadonlyMap<string, string[]>
  agentIds: ReadonlySet<string>
  defaultAgentId?: string | null
  getPos: PositionResolver
}

function buildChannelElements({
  channelList,
  channelRoutes,
  agentIds,
  defaultAgentId,
  getPos,
}: BuildChannelElementsParams): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = []
  const edges: Edge[] = []

  channelList.forEach(([channel, accountIds], index) => {
    const nodeId = `ch-${channel}`
    const fallbackY = -((channelList.length - 1) * 100) / 2 + index * 100
    const routeAgentIds = channelRoutes.get(channel) ?? []

    nodes.push({
      id: nodeId,
      type: 'channel',
      position: getPos(nodeId, FALLBACK_CHANNEL_X, fallbackY),
      data: { channel, accountIds: Array.from(accountIds) },
      draggable: true,
    })

    for (const agentId of routeAgentIds) {
      edges.push({
        id: `ch-${channel}-${agentId}`,
        source: nodeId,
        target: `agent-${agentId}`,
        type: 'default',
        style: { stroke: ROUTE_COLOR, strokeWidth: 1.5 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: ROUTE_COLOR,
          width: 14,
          height: 10,
        },
      })
    }

    if (routeAgentIds.length === 0 && defaultAgentId && agentIds.has(defaultAgentId)) {
      edges.push({
        id: `ch-${channel}-default-${defaultAgentId}`,
        source: nodeId,
        target: `agent-${defaultAgentId}`,
        type: 'default',
        style: {
          stroke: 'var(--muted-foreground)',
          strokeWidth: 1,
          strokeDasharray: '3 3',
          opacity: 0.6,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: 'var(--muted-foreground)',
          width: 12,
          height: 8,
        },
      })
    }
  })

  return { nodes, edges }
}

interface BuildWorkspaceElementsParams {
  workspaceList: Array<[string, string[]]>
  agents: GatewayAgentRow[]
  getWorkspace: (agentId: string) => string
  onWorkspaceClick: (path: string) => void
  getPos: PositionResolver
}

function buildWorkspaceElements({
  workspaceList,
  agents,
  getWorkspace,
  onWorkspaceClick,
  getPos,
}: BuildWorkspaceElementsParams): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = []
  const edges: Edge[] = []

  workspaceList.forEach(([workspace, agentNames], index) => {
    const nodeId = `ws-${index}`
    const fallbackY = -((workspaceList.length - 1) * 100) / 2 + index * 100

    nodes.push({
      id: nodeId,
      type: 'workspace',
      position: getPos(nodeId, FALLBACK_WORKSPACE_X, fallbackY),
      data: { path: workspace, agentNames, onClick: () => onWorkspaceClick(workspace) },
      draggable: true,
    })

    for (const agent of agents) {
      if (getWorkspace(agent.id) !== workspace) continue
      edges.push({
        id: `ws-${agent.id}-${index}`,
        source: `agent-${agent.id}`,
        target: nodeId,
        style: { stroke: WORKSPACE_COLOR, strokeWidth: 1.5 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: WORKSPACE_COLOR,
          width: 14,
          height: 10,
        },
      })
    }
  })

  return { nodes, edges }
}

function buildGraph({
  agents,
  identities,
  config,
  sessions,
  activeRuns,
  selectedAgentId,
  onSelectAgent,
  onViewDetails,
  onWorkspaceClick,
  defaultAgentId,
  layoutMode,
}: BuildGraphParams): { nodes: Node[]; edges: Edge[] } {
  const agentConfigMap = createAgentConfigMap(config)
  const getWorkspace = createWorkspaceResolver(agentConfigMap)
  const getSubagents = createSubagentResolver(agentConfigMap)
  const sessionsByAgentId = computeAgentSessionStats(agents, sessions)
  const bindings = config?.bindings ?? []
  const { channelList, channelRoutes } = collectChannelData(bindings)
  const workspaceList = collectWorkspaceData(agents, identities, getWorkspace)
  const layoutPositions = computeLayout(layoutMode, {
    agents,
    config,
    channelList,
    workspaceList,
    defaultAgentId,
    getSubagents,
    getWorkspace,
  })

  const getPos: PositionResolver = (nodeId, fallbackX, fallbackY) =>
    layoutPositions.get(nodeId) ?? { x: fallbackX, y: fallbackY }
  const agentIds = new Set(agents.map((agent) => agent.id))
  const gatewayNode = buildGatewayNodeElement(agents.length, getPos('gateway', 0, 0))
  const agentElements = buildAgentElements({
    agents,
    identities,
    agentConfigMap,
    defaultModel: config?.agents?.defaults?.model,
    sessionsByAgentId,
    activeRuns,
    selectedAgentId,
    onSelectAgent,
    onViewDetails,
    defaultAgentId,
    getPos,
  })
  const delegationEdges = buildDelegationEdgeElements(agents, getSubagents)
  const channelElements = buildChannelElements({
    channelList,
    channelRoutes,
    agentIds,
    defaultAgentId,
    getPos,
  })
  const workspaceElements = buildWorkspaceElements({
    workspaceList,
    agents,
    getWorkspace,
    onWorkspaceClick,
    getPos,
  })

  return {
    nodes: [gatewayNode, ...agentElements.nodes, ...channelElements.nodes, ...workspaceElements.nodes],
    edges: [...agentElements.edges, ...delegationEdges, ...channelElements.edges, ...workspaceElements.edges],
  }
}

// -- Flow View Inner ----------------------------------------------------------

interface FlowViewInnerProps {
  agents: GatewayAgentRow[]
  identities: Record<string, AgentIdentityResult>
  config: ParsedConfig | null | undefined
  sessions: AgentSession[]
  activeRuns: ActiveRunMap
  selectedAgentId: string | null
  onSelectAgent: (id: string) => void
  onViewDetails: (id: string) => void
  onWorkspaceClick: (path: string) => void
  defaultAgentId?: string | null
  layoutMode: LayoutMode
  onLayoutModeChange: (mode: LayoutMode) => void
}

function FlowViewInner({
  agents,
  identities,
  config,
  sessions,
  activeRuns,
  selectedAgentId,
  onSelectAgent,
  onViewDetails,
  onWorkspaceClick,
  defaultAgentId,
  layoutMode,
  onLayoutModeChange,
}: Readonly<FlowViewInnerProps>) {
  const { fitView } = useReactFlow()
  const isMounted = useRef(false)

  const graph = useMemo(
    () =>
      buildGraph({
        agents,
        identities,
        config,
        sessions,
        activeRuns,
        selectedAgentId,
        onSelectAgent,
        onViewDetails,
        onWorkspaceClick,
        defaultAgentId,
        layoutMode,
      }),
    [
      agents,
      identities,
      config,
      sessions,
      activeRuns,
      selectedAgentId,
      defaultAgentId,
      onSelectAgent,
      onViewDetails,
      onWorkspaceClick,
      layoutMode,
    ],
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(graph.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(graph.edges)

  // Load saved positions on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LAYOUT_STORAGE_KEY)
      if (saved) {
        const savedPositions = JSON.parse(saved) as Record<string, { x: number; y: number }>
        setNodes((nds) =>
          nds.map((node) => {
            const savedPos = savedPositions[node.id]
            if (savedPos) {
              return { ...node, position: savedPos }
            }
            return node
          }),
        )
      }
    } catch {
      // Ignore localStorage errors
    }
  }, [setNodes])

  // Save positions when nodes change
  const handleNodesChange = useCallback(
    (changes: Parameters<typeof onNodesChange>[0]) => {
      onNodesChange(changes)

      const positionChanges = changes.filter((c) => c.type === 'position' && c.dragging === false && c.position)
      if (positionChanges.length > 0) {
        try {
          const currentPositions: Record<string, { x: number; y: number }> = {}
          nodes.forEach((node) => {
            currentPositions[node.id] = node.position
          })
          for (const change of positionChanges) {
            if (change.type === 'position' && change.position) {
              currentPositions[change.id] = change.position
            }
          }
          localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(currentPositions))
        } catch {
          // Ignore localStorage errors
        }
      }
    },
    [nodes, onNodesChange],
  )

  // Reset layout
  const handleResetLayout = useCallback(() => {
    localStorage.removeItem(LAYOUT_STORAGE_KEY)
    setNodes(graph.nodes)
    setEdges(graph.edges)
    fitView({ padding: 0.15 })
  }, [graph, setNodes, setEdges, fitView])

  // Sync state when graph changes
  useEffect(() => {
    if (!isMounted.current) {
      isMounted.current = true
      return
    }
    setNodes(graph.nodes)
    setEdges(graph.edges)
  }, [graph, setNodes, setEdges])

  const handleFitView = useCallback(() => {
    fitView({ padding: 0.15 })
  }, [fitView])

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={handleNodesChange}
      onEdgesChange={onEdgesChange}
      onInit={handleFitView}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.15 }}
      proOptions={{ hideAttribution: true }}
      minZoom={0.1}
      maxZoom={2}
      defaultEdgeOptions={{ type: 'default' }}
    >
      <Background className="!bg-card" color="var(--border)" gap={20} size={1} />
      <Controls
        showInteractive={false}
        className="!bg-card !border-border !shadow-xl [&>button]:!bg-secondary [&>button]:!border-border [&>button]:!text-muted-foreground [&>button:hover]:!bg-accent"
      />
      <div className="absolute bottom-4 right-4 z-50 flex items-center gap-2 pointer-events-auto">
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium shadow-lg hover:bg-accent flex items-center gap-1.5"
              title="Layout mode"
            >
              {(() => {
                const Icon = LAYOUT_MODE_INFO[layoutMode].icon
                return <Icon className="h-3 w-3" />
              })()}
              {LAYOUT_MODE_INFO[layoutMode].label}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-2" align="end">
            <div className="space-y-1">
              {(Object.keys(LAYOUT_MODE_INFO) as LayoutMode[]).map((mode) => {
                const info = LAYOUT_MODE_INFO[mode]
                const Icon = info.icon
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => onLayoutModeChange(mode)}
                    className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-left transition-colors ${
                      layoutMode === mode ? 'bg-primary/10 text-primary' : 'hover:bg-muted'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <div>
                      <div className="font-medium">{info.label}</div>
                      <div className="text-muted-foreground text-[10px]">{info.description}</div>
                    </div>
                  </button>
                )
              })}
            </div>
          </PopoverContent>
        </Popover>
        <button
          type="button"
          onClick={handleResetLayout}
          className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium shadow-lg hover:bg-accent"
          title="Reset layout"
        >
          <RotateCcw className="mr-1 h-3 w-3" />
          Reset
        </button>
      </div>
    </ReactFlow>
  )
}

// -- Main Component -----------------------------------------------------------

interface AgentHierarchyProps {
  agents: GatewayAgentRow[]
  identities: Record<string, AgentIdentityResult>
  config: ParsedConfig | null | undefined
  sessions: AgentSession[]
  activeRuns: ActiveRunMap
  selectedAgentId: string | null
  onSelectAgent: (id: string) => void
  onWorkspaceClick?: (path: string) => void
  defaultAgentId?: string | null
  layoutMode?: LayoutMode
  onLayoutModeChange?: (mode: LayoutMode) => void
}

export function AgentHierarchy({
  agents,
  identities,
  config,
  sessions,
  activeRuns,
  selectedAgentId,
  onSelectAgent,
  onWorkspaceClick,
  defaultAgentId,
  layoutMode: externalLayoutMode,
  onLayoutModeChange,
}: Readonly<AgentHierarchyProps>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null)
  const [detailsAgentId, setDetailsAgentId] = useState<string | null>(null)
  const agentConfigMap = useMemo(() => createAgentConfigMap(config), [config])
  const getWorkspace = useMemo(() => createWorkspaceResolver(agentConfigMap), [agentConfigMap])
  const getSubagents = useMemo(() => createSubagentResolver(agentConfigMap), [agentConfigMap])

  // Layout mode state - use external if provided, otherwise internal with persistence
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(() => {
    // Try to get from localStorage first
    try {
      const saved = localStorage.getItem(LAYOUT_STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as { layoutMode?: LayoutMode }
        if (parsed.layoutMode && LAYOUT_MODE_INFO[parsed.layoutMode]) {
          return parsed.layoutMode
        }
      }
    } catch {
      // Ignore
    }
    return externalLayoutMode ?? 'compact'
  })

  // Sync with external layoutMode if provided
  useEffect(() => {
    if (externalLayoutMode && externalLayoutMode !== layoutMode) {
      setLayoutMode(externalLayoutMode)
    }
  }, [externalLayoutMode, layoutMode])

  // Callback to open details dialog
  const handleViewDetails = (agentId: string) => {
    setDetailsAgentId(agentId)
  }

  // Callback for workspace click
  const handleWorkspaceClick = (path: string) => {
    if (onWorkspaceClick) {
      onWorkspaceClick(path)
    }
    // Find and select the agent that owns this workspace
    for (const agent of agents) {
      if (getWorkspace(agent.id) === path) {
        onSelectAgent(agent.id)
        break
      }
    }
  }

  const sessionsByAgentId = useMemo(() => computeAgentSessionStats(agents, sessions), [agents, sessions])

  const detailsAgent = detailsAgentId ? agents.find((a) => a.id === detailsAgentId) : null
  const detailsStats = detailsAgentId ? sessionsByAgentId.get(detailsAgentId) : null

  // Compute parent/child relationships for delegation display
  // childMap: parentId -> childIds[] (which agents delegate to which)
  // parentMap: childId -> parentId (which agent is the parent of this one)
  const { parentMap, childMap } = useMemo(() => {
    const parentMap = new Map<string, string | null>()
    const childMap = new Map<string, string[]>()
    const agentIds = new Set(agents.map((agent) => agent.id))

    for (const agent of agents) {
      const subs = getSubagents(agent.id)
      const validChildren = subs.filter((subId) => subId !== agent.id && agentIds.has(subId))
      childMap.set(agent.id, validChildren)
    }

    for (const agent of agents) {
      for (const subId of childMap.get(agent.id) ?? []) {
        if (!parentMap.has(subId)) {
          parentMap.set(subId, agent.id)
        }
      }
    }

    return { parentMap, childMap }
  }, [agents, getSubagents])

  const detailsBindings = useMemo(() => {
    if (!detailsAgentId || !config?.bindings) return []
    return config.bindings.filter((b) => b.agentId === detailsAgentId)
  }, [detailsAgentId, config])

  const detailsStatus = useMemo(() => {
    if (!detailsAgentId) return 'inactive' as const
    const stats = sessionsByAgentId.get(detailsAgentId)
    return deriveAgentStatus(detailsAgentId, activeRuns, stats?.lastActive ?? null).status
  }, [detailsAgentId, activeRuns, sessionsByAgentId])

  // Measure container
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        if (width > 0 && height > 0) {
          setDims({ w: width, h: height })
        }
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Handle layout mode change with persistence
  const handleLayoutModeChange = useCallback(
    (newMode: LayoutMode) => {
      setLayoutMode(newMode)
      // Clear position storage when mode changes (positions are mode-specific)
      localStorage.removeItem(LAYOUT_STORAGE_KEY)
      onLayoutModeChange?.(newMode)
    },
    [onLayoutModeChange],
  )

  return (
    <div ref={containerRef} className="relative h-full w-full">
      {dims ? (
        <div style={{ width: dims.w, height: dims.h, position: 'absolute', inset: 0 }}>
          <ReactFlowProvider>
            <TabErrorBoundary tab="hierarchy">
              <FlowViewInner
                agents={agents}
                identities={identities}
                config={config}
                sessions={sessions}
                activeRuns={activeRuns}
                selectedAgentId={selectedAgentId}
                onSelectAgent={onSelectAgent}
                onViewDetails={handleViewDetails}
                onWorkspaceClick={handleWorkspaceClick}
                defaultAgentId={defaultAgentId}
                layoutMode={layoutMode}
                onLayoutModeChange={handleLayoutModeChange}
              />
            </TabErrorBoundary>
          </ReactFlowProvider>
        </div>
      ) : (
        <div className="flex h-full items-center justify-center text-muted-foreground/40">
          <span className="inline-flex items-center gap-1">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:0ms]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:150ms]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:300ms]" />
          </span>
        </div>
      )}

      {detailsAgent && detailsStats && (
        <AgentHierarchyDialog
          open={!!detailsAgentId}
          onOpenChange={(open) => {
            if (!open) setDetailsAgentId(null)
          }}
          agent={detailsAgent}
          identity={identities[detailsAgent.id]}
          stats={detailsStats}
          status={detailsStatus}
          config={config}
          isDefault={detailsAgent.id === defaultAgentId}
          parentAgentId={parentMap.get(detailsAgent.id) ?? null}
          childAgentIds={childMap.get(detailsAgent.id) ?? []}
          agentBindings={detailsBindings}
        />
      )}
    </div>
  )
}
