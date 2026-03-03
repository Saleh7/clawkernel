import {
  Activity,
  ChevronDown,
  Circle,
  Cpu,
  FolderOpen,
  Layers,
  MessageSquare,
  RefreshCw,
  Save,
  Shield,
  Wrench,
  Zap,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { formatTokens } from '@/lib/format'
import type { GatewayClient } from '@/lib/gateway/client'
import type {
  AgentIdentityResult,
  AgentsListResult,
  ConfigSnapshot,
  GatewayAgentRow,
  GatewaySessionRow,
} from '@/lib/gateway/types'
import { createLogger } from '@/lib/logger'
import { ACTIVE_SESSION_MS } from '@/lib/session-constants'
import { cn } from '@/lib/utils'
import { EditIdentityDialog } from '../dialogs/edit-identity-dialog'
import { useAgentConfigSave } from '../hooks/use-agent-config-save'
import { DangerZone, QuickActions } from './overview-panels'

const log = createLogger('agents:overview')

// ---------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------

type Props = {
  readonly agent: GatewayAgentRow
  readonly agentsList: AgentsListResult
  readonly config: ConfigSnapshot | null
  readonly workspace: string | null
  readonly sessions: GatewaySessionRow[]
  readonly identity?: AgentIdentityResult | null
  readonly activeRuns?: Record<string, { sessionKey: string; startedAt: number }>
  readonly deleteSlot?: React.ReactNode
  readonly client: GatewayClient | null
}

import type { ParsedConfig } from '../types'

type ModelChoice = { id: string; name: string; provider: string; contextWindow?: number; reasoning?: boolean }

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

function resolveModel(model?: unknown): { primary: string; fallbacks: string[] } {
  if (!model) return { primary: '', fallbacks: [] }
  if (typeof model === 'string') return { primary: model.trim(), fallbacks: [] }
  if (typeof model === 'object' && model) {
    const t = model as { primary?: string; fallbacks?: string[] }
    return { primary: t.primary?.trim() || '', fallbacks: Array.isArray(t.fallbacks) ? t.fallbacks : [] }
  }
  return { primary: '', fallbacks: [] }
}

type ModelOption = { value: string; label: string }
type ModelOptionWithProvider = ModelOption & { provider?: string }

function buildConfiguredModels(models: unknown): ModelOption[] {
  if (!models || typeof models !== 'object') return []
  return Object.entries(models as Record<string, { alias?: string } | null>).map(([id, meta]) => {
    const alias = meta?.alias?.trim()
    return { value: id, label: alias && alias !== id ? `${alias} (${id})` : id }
  })
}

function buildAllModelOptions(
  configuredModels: ModelOption[],
  availableModels: ModelChoice[],
  primaryDraft: string,
): ModelOptionWithProvider[] {
  const seen = new Set<string>()
  const options: ModelOptionWithProvider[] = []
  for (const m of configuredModels) {
    if (!seen.has(m.value)) {
      seen.add(m.value)
      options.push(m)
    }
  }
  for (const m of availableModels) {
    if (!seen.has(m.id)) {
      seen.add(m.id)
      options.push({ value: m.id, label: `${m.name} (${m.provider})`, provider: m.provider })
    }
  }
  const current = primaryDraft.trim()
  if (current && !seen.has(current)) {
    options.unshift({ value: current, label: current })
  }
  return options
}

function buildSessionTypeLabel(agentSessions: GatewaySessionRow[]): string {
  const direct = agentSessions.filter((s) => s.kind === 'direct').length
  const group = agentSessions.filter((s) => s.kind === 'group').length
  const sub = agentSessions.filter((s) => s.key.includes(':subagent:')).length
  return `${direct} direct · ${group} group · ${sub} sub`
}

type AgentStatusInfo = { readonly status: string; readonly color: string }

function getAgentStatusInfo(
  isRunning: boolean,
  activeSessions: GatewaySessionRow[],
  agentSessions: GatewaySessionRow[],
): AgentStatusInfo {
  if (isRunning) return { status: 'Running', color: 'text-chart-1' }
  if (activeSessions.length > 0) return { status: 'Active', color: 'text-green-500' }
  if (agentSessions.length > 0) return { status: 'Idle', color: 'text-yellow-500' }
  return { status: 'Inactive', color: 'text-muted-foreground/40' }
}

// ---------------------------------------------------------------------------
//  Cell
// ---------------------------------------------------------------------------

function Cell({
  icon: Icon,
  label,
  value,
  mono = false,
  badge,
  subValue,
}: {
  readonly icon: typeof Activity
  readonly label: string
  readonly value: string
  readonly mono?: boolean
  readonly badge?: string
  readonly subValue?: string
}) {
  return (
    <div className="rounded-xl border border-border/40 bg-background/50 p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/60">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </span>
        {badge && (
          <Badge variant="secondary" className="text-[9px]">
            {badge}
          </Badge>
        )}
      </div>
      <p className={cn('text-sm font-semibold truncate', mono && 'font-mono text-xs')}>{value}</p>
      {subValue && <p className="text-[10px] text-muted-foreground/50">{subValue}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
//  AgentOverview — main export
// ---------------------------------------------------------------------------

export function AgentOverview({
  agent,
  agentsList,
  config,
  workspace,
  sessions,
  identity,
  activeRuns = {},
  deleteSlot,
  client,
}: Props) {
  const cfg = config?.config as ParsedConfig | null | undefined
  const entry = cfg?.agents?.list?.find((item) => item.id === agent.id)
  const defaults = cfg?.agents?.defaults
  const isDefault = agent.id === agentsList.defaultId

  const identityName = identity?.name?.trim() || agent.identity?.name?.trim() || agent.name?.trim() || agent.id
  const identityEmoji = identity?.emoji?.trim() || agent.identity?.emoji?.trim() || ''

  const agentModel = resolveModel(entry?.model)
  const defaultModel = resolveModel(defaults?.model)
  const effectiveModel = agentModel.primary ? agentModel : defaultModel
  const hasOwnModel = !!agentModel.primary

  const [primaryDraft, setPrimaryDraft] = useState(agentModel.primary)
  const [fallbacksDraft, setFallbacksDraft] = useState(agentModel.fallbacks.join(', '))
  const [availableModels, setAvailableModels] = useState<ModelChoice[]>([])

  useEffect(() => {
    const m = resolveModel(entry?.model)
    setPrimaryDraft(m.primary)
    setFallbacksDraft(m.fallbacks.join(', '))
  }, [entry?.model])

  useEffect(() => {
    if (!client) return
    client
      .request<{ models: ModelChoice[] }>('models.list', {})
      .then((r) => setAvailableModels(r.models))
      .catch((err) => log.warn('Models list failed', err))
  }, [client])

  const isDirty = useMemo(() => {
    if (primaryDraft !== agentModel.primary) return true
    const draftArr = fallbacksDraft
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (draftArr.length !== agentModel.fallbacks.length) return true
    return draftArr.some((s, i) => s !== agentModel.fallbacks[i])
  }, [primaryDraft, fallbacksDraft, agentModel])

  const buildModelPatch = useCallback(
    (entry: Record<string, unknown>) => {
      const fallbacksArr = fallbacksDraft
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      const modelValue = primaryDraft.trim()
        ? fallbacksArr.length > 0
          ? { primary: primaryDraft.trim(), fallbacks: fallbacksArr }
          : primaryDraft.trim()
        : undefined

      if (modelValue) {
        return { ...entry, model: modelValue }
      }
      const { model: _, ...rest } = entry as Record<string, unknown> & { model?: unknown }
      return rest
    },
    [primaryDraft, fallbacksDraft],
  )

  const {
    saving,
    save: saveModel,
    saveAndApply: saveAndApplyModel,
  } = useAgentConfigSave({
    client,
    config,
    agentId: agent.id,
    isDirty,
    patcher: buildModelPatch,
    messages: {
      saveError: 'Failed to save model configuration',
      applySuccess: 'Model saved & applied — agents restarting',
      applyError: 'Failed to save & apply model configuration',
    },
  })

  const configuredModels = buildConfiguredModels(defaults?.models)
  const allModelOptions = buildAllModelOptions(configuredModels, availableModels, primaryDraft)

  const workspaceLabel = workspace || entry?.workspace || defaults?.workspace || 'not available'
  const toolProfile = entry?.tools?.profile || defaults?.tools?.profile || 'full'
  const skillPolicy = Array.isArray(entry?.skills) ? `${entry.skills.length} filtered` : 'all enabled'

  const agentSessions = useMemo(
    () => sessions.filter((s) => s.key.startsWith(`agent:${agent.id}:`)),
    [sessions, agent.id],
  )
  const activeSessions = useMemo(
    () => agentSessions.filter((s) => s.updatedAt && Date.now() - s.updatedAt < ACTIVE_SESSION_MS),
    [agentSessions],
  )
  const totalTokens = useMemo(() => agentSessions.reduce((sum, s) => sum + (s.totalTokens ?? 0), 0), [agentSessions])
  const inputTokens = useMemo(() => agentSessions.reduce((sum, s) => sum + (s.inputTokens ?? 0), 0), [agentSessions])
  const outputTokens = useMemo(() => agentSessions.reduce((sum, s) => sum + (s.outputTokens ?? 0), 0), [agentSessions])

  const isRunning = Object.values(activeRuns).some((r) => r.sessionKey.startsWith(`agent:${agent.id}:`))
  const { status: agentStatus, color: statusColor } = getAgentStatusInfo(isRunning, activeSessions, agentSessions)

  return (
    <div className="space-y-3">
      {/* ── Identity Row ── */}
      <div className="rounded-xl border border-border/40 bg-background/50 p-5">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-border/40 bg-muted/30 text-2xl">
            {identityEmoji || identityName.slice(0, 1)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold tracking-tight truncate">{identityName}</h2>
              {isDefault && (
                <Badge variant="secondary" className="text-[9px] uppercase tracking-widest shrink-0">
                  Default
                </Badge>
              )}
            </div>
            <p className="font-mono text-[11px] text-muted-foreground/50">{agent.id}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <EditIdentityDialog agentId={agent.id} identity={identity} client={client} />
            {deleteSlot}
          </div>
        </div>
      </div>

      {/* ── Quick Actions ── */}
      <QuickActions
        agentId={agent.id}
        isDefault={isDefault}
        client={client}
        config={config}
        agentSessions={agentSessions}
      />

      {/* ── Stats Grid ── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Cell
          icon={Activity}
          label="Sessions"
          value={`${agentSessions.length} total`}
          badge={`${activeSessions.length} active`}
        />
        <Cell
          icon={MessageSquare}
          label="Token Usage"
          value={formatTokens(totalTokens)}
          subValue={`${formatTokens(inputTokens)} in · ${formatTokens(outputTokens)} out`}
        />
        <Cell icon={FolderOpen} label="Workspace" value={workspaceLabel} mono />
        <div className="rounded-xl border border-border/40 bg-background/50 p-4 space-y-2">
          <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/60">
            <Circle className="h-3.5 w-3.5" />
            Status
          </span>
          <p className={cn('text-sm font-semibold', statusColor)}>
            {agentStatus}
            {isRunning && (
              <span className="ml-1.5 inline-block h-2 w-2 rounded-full bg-chart-1 animate-pulse align-middle" />
            )}
          </p>
        </div>
      </div>

      {/* ── Model Configuration ── */}
      <div className="rounded-xl border border-border/40 bg-background/50 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold tracking-tight">Model Configuration</h3>
          </div>
          <div className="flex items-center gap-2">
            {isDirty && (
              <Badge variant="outline" className="text-[9px] border-yellow-500/30 text-yellow-500">
                unsaved
              </Badge>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => void saveModel()}
              disabled={saving || !isDirty}
              className="gap-1.5 h-7 rounded-lg text-[11px]"
            >
              <Save className="h-3 w-3" /> Save
            </Button>
            <Button
              size="sm"
              onClick={() => void saveAndApplyModel()}
              disabled={saving || !isDirty}
              className="gap-1.5 h-7 rounded-lg text-[11px]"
            >
              {saving ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
              {saving ? 'Applying…' : 'Save & Apply'}
            </Button>
          </div>
        </div>

        <Separator className="opacity-40" />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Primary Model {isDefault ? '(default)' : ''}</Label>
            <div className="relative">
              <select
                value={primaryDraft}
                onChange={(e) => setPrimaryDraft(e.target.value)}
                className={cn(
                  'w-full appearance-none rounded-lg border border-border bg-background px-3 py-2 pr-8',
                  'font-mono text-xs text-foreground',
                  'focus:outline-none focus:ring-2 focus:ring-ring/50',
                )}
              >
                {!isDefault && <option value="">Inherit default ({defaultModel.primary || 'none'})</option>}
                {allModelOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
            </div>
            {!hasOwnModel && !isDefault && primaryDraft === '' && (
              <p className="text-[10px] text-muted-foreground/50">
                Inheriting: <span className="font-mono">{defaultModel.primary || 'none'}</span>
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Fallback Models</Label>
            <Input
              value={fallbacksDraft}
              onChange={(e) => setFallbacksDraft(e.target.value)}
              placeholder="provider/model, provider/model"
              className="font-mono text-xs"
            />
            <p className="text-[10px] text-muted-foreground/50">Comma-separated. Used when primary is unavailable.</p>
          </div>
        </div>

        <div className="rounded-lg bg-muted/20 px-3 py-2.5 flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">Effective model</span>
          <span className="font-mono text-xs text-foreground">
            {primaryDraft.trim() || effectiveModel.primary || 'unassigned'}
            {(fallbacksDraft.trim() || effectiveModel.fallbacks.length > 0) && (
              <span className="text-muted-foreground ml-1">
                (+{fallbacksDraft.split(',').filter((s) => s.trim()).length || effectiveModel.fallbacks.length}{' '}
                fallback)
              </span>
            )}
          </span>
        </div>
      </div>

      {/* ── Quick Info ── */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Cell icon={Zap} label="Skill Policy" value={skillPolicy} />
        <Cell icon={Shield} label="Default Agent" value={isDefault ? 'Yes — primary fleet agent' : 'No'} />
        <Cell icon={Wrench} label="Tool Profile" value={toolProfile} />
        <Cell icon={Layers} label="Session Types" value={buildSessionTypeLabel(agentSessions)} />
      </div>

      {/* ── Danger Zone ── */}
      <DangerZone
        agentId={agent.id}
        isDefault={isDefault}
        client={client}
        agentSessions={agentSessions}
        deleteSlot={deleteSlot}
      />
    </div>
  )
}
