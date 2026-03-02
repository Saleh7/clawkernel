import { ChevronDown, ChevronUp, Loader2, X } from 'lucide-react'
import { useState } from 'react'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { ModelCatalogEntry } from '@/lib/gateway/types'
import { cn } from '@/lib/utils'
import type { AgentModelConfig } from '../hooks/use-models'
import { ModelPicker } from './model-picker'
import { RoutingSection } from './routing-section'

type Tab = 'per-agent' | 'heartbeat' | 'routing'

type AgentListEntry = { id: string; name?: string; model?: AgentModelConfig }

type Props = {
  agentList: AgentListEntry[]
  heartbeatModel: string | null
  defaultModel: AgentModelConfig
  imageModel: AgentModelConfig
  models: ModelCatalogEntry[]
  saving: boolean
  saveError: string | null
  onSetAgentModel: (agentId: string, model: string | null) => Promise<void>
  onSetHeartbeatModel: (model: string | null) => Promise<void>
  onSetDefaultModel: (model: string) => Promise<void>
  onAddDefaultFallback: (fallback: string) => Promise<void>
  onRemoveDefaultFallback: (fallback: string) => Promise<void>
  onSetImageModel: (model: string) => Promise<void>
  onAddImageFallback: (fallback: string) => Promise<void>
  onRemoveImageFallback: (fallback: string) => Promise<void>
}

// ---------------------------------------------------------------------------
//  Per-Agent tab
// ---------------------------------------------------------------------------

type PerAgentTabProps = {
  agentList: AgentListEntry[]
  models: ModelCatalogEntry[]
  saving: boolean
  onSetAgentModel: (agentId: string, model: string | null) => Promise<void>
}

function PerAgentTab({ agentList, models, saving, onSetAgentModel }: PerAgentTabProps) {
  const [overrideAgent, setOverrideAgent] = useState<string | null>(null)
  const [selectedModel, setSelectedModel] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingReset, setPendingReset] = useState<AgentListEntry | null>(null)
  const [resetLoading, setResetLoading] = useState(false)

  const handleSetOverride = async (agentId: string) => {
    if (!selectedModel) return
    await onSetAgentModel(agentId, selectedModel)
    setOverrideAgent(null)
    setSelectedModel('')
  }

  const handleConfirmReset = async () => {
    if (!pendingReset) return
    setResetLoading(true)
    try {
      await onSetAgentModel(pendingReset.id, null)
    } finally {
      setResetLoading(false)
      setConfirmOpen(false)
      setPendingReset(null)
    }
  }

  if (agentList.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-2">
        <p className="text-xs text-muted-foreground/50">No agents available</p>
      </div>
    )
  }

  return (
    <>
      <div className="rounded-xl border border-border/40 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/40 bg-muted/20">
              <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground/70 uppercase tracking-wider text-[10px]">
                Agent
              </th>
              <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground/70 uppercase tracking-wider text-[10px]">
                Current Model
              </th>
              <th className="px-4 py-2.5 text-right font-semibold text-muted-foreground/70 uppercase tracking-wider text-[10px]">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {agentList.map((agent) => {
              const hasOverride = agent.model != null
              const isEditing = overrideAgent === agent.id
              return (
                <tr key={agent.id} className="hover:bg-muted/10 transition-colors">
                  {/* Agent name/id */}
                  <td className="px-4 py-2.5">
                    <div>
                      <p className="font-semibold text-foreground">{agent.name ?? agent.id}</p>
                      {agent.name && <p className="text-[10px] text-muted-foreground/50 font-mono">{agent.id}</p>}
                    </div>
                  </td>

                  {/* Current model / inline picker */}
                  <td className="px-4 py-2.5">
                    {isEditing ? (
                      <div className="flex gap-2 items-center">
                        <div className="flex-1 min-w-0">
                          <ModelPicker
                            models={models}
                            value={selectedModel}
                            onChange={setSelectedModel}
                            placeholder="Select model…"
                            disabled={saving}
                          />
                        </div>
                        <Button
                          size="sm"
                          variant="default"
                          className="h-7 px-2 text-xs shrink-0"
                          disabled={saving || !selectedModel}
                          onClick={() => void handleSetOverride(agent.id)}
                        >
                          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Set'}
                        </Button>
                        <button
                          type="button"
                          aria-label="Cancel override"
                          className="rounded p-1 text-muted-foreground/50 hover:text-foreground hover:bg-muted/30 transition-colors"
                          onClick={() => {
                            setOverrideAgent(null)
                            setSelectedModel('')
                          }}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : hasOverride ? (
                      <div className="flex items-center gap-1.5">
                        <code className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-foreground">
                          {typeof agent.model === 'string' ? agent.model : (agent.model?.primary ?? '?')}
                        </code>
                        <Badge variant="secondary" className="text-[9px]">
                          override
                        </Badge>
                      </div>
                    ) : (
                      <span className="text-[11px] text-muted-foreground/40 italic">→ global default</span>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-2.5">
                    <div className="flex gap-1.5 justify-end">
                      {!isEditing && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[10px]"
                          disabled={saving}
                          onClick={() => {
                            setOverrideAgent(agent.id)
                            setSelectedModel(
                              hasOverride
                                ? typeof agent.model === 'string'
                                  ? agent.model
                                  : (agent.model?.primary ?? '')
                                : '',
                            )
                          }}
                        >
                          Override
                        </Button>
                      )}
                      {hasOverride && !isEditing && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-[10px] text-muted-foreground"
                          disabled={saving}
                          onClick={() => {
                            setPendingReset(agent)
                            setConfirmOpen(true)
                          }}
                        >
                          Reset
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!resetLoading) {
            setConfirmOpen(open)
            if (!open) setPendingReset(null)
          }
        }}
        title="Reset Agent Model"
        description={
          pendingReset ? (
            <span>
              Reset model override for{' '}
              <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">
                {pendingReset.name ?? pendingReset.id}
              </code>
              ? The agent will use the global default model.
            </span>
          ) : null
        }
        actionLabel="Reset"
        loadingLabel="Resetting…"
        variant="destructive"
        loading={resetLoading}
        onConfirm={handleConfirmReset}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
//  Heartbeat tab
// ---------------------------------------------------------------------------

type HeartbeatTabProps = {
  heartbeatModel: string | null
  models: ModelCatalogEntry[]
  saving: boolean
  onSetHeartbeatModel: (model: string | null) => Promise<void>
}

function HeartbeatTab({ heartbeatModel, models, saving, onSetHeartbeatModel }: HeartbeatTabProps) {
  const [selected, setSelected] = useState('')

  const handleSet = async () => {
    if (!selected) return
    await onSetHeartbeatModel(selected)
    setSelected('')
  }

  const handleClear = async () => {
    await onSetHeartbeatModel(null)
  }

  return (
    <div className="space-y-4">
      {/* Current heartbeat model */}
      <div className="rounded-xl border border-border/40 bg-card/80 px-4 py-3 space-y-1">
        <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider">
          Current Heartbeat Model
        </p>
        {heartbeatModel ? (
          <div className="flex items-center gap-2 flex-wrap">
            <code className="rounded-md bg-muted px-2 py-1 text-xs font-mono text-foreground">{heartbeatModel}</code>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-[10px] text-muted-foreground"
              disabled={saving}
              onClick={() => void handleClear()}
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Clear'}
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground/50 italic">Not set — uses global default</p>
        )}
      </div>

      {/* Set heartbeat model picker */}
      <div className="space-y-2">
        <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider">
          Set Heartbeat Model
        </p>
        <div className="flex gap-2">
          <div className="flex-1">
            <ModelPicker
              models={models}
              value={selected}
              onChange={setSelected}
              placeholder="Select model…"
              disabled={saving}
            />
          </div>
          <Button
            size="sm"
            variant="default"
            className="h-[34px] px-3 text-xs shrink-0"
            disabled={saving || !selected}
            onClick={() => void handleSet()}
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Set'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
//  AdvancedSettings
// ---------------------------------------------------------------------------

export function AdvancedSettings({
  agentList,
  heartbeatModel,
  defaultModel,
  imageModel,
  models,
  saving,
  saveError,
  onSetAgentModel,
  onSetHeartbeatModel,
  onSetDefaultModel,
  onAddDefaultFallback,
  onRemoveDefaultFallback,
  onSetImageModel,
  onAddImageFallback,
  onRemoveImageFallback,
}: Props) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('per-agent')

  const hasOverrides = agentList.some((a) => a.model != null) || heartbeatModel != null

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'per-agent', label: 'Per-Agent' },
    { id: 'heartbeat', label: 'Heartbeat' },
    { id: 'routing', label: 'Routing' },
  ]

  return (
    <div className="space-y-3">
      {/* Collapsible header */}
      <button
        type="button"
        className="w-full flex items-center gap-2 text-left"
        aria-label={open ? 'Collapse advanced settings' : 'Expand advanced settings'}
        onClick={() => setOpen((v) => !v)}
      >
        <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Advanced Settings</p>
        {hasOverrides && (
          <Badge className="text-[10px] bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
            Overrides active
          </Badge>
        )}
        <div className="ml-auto text-muted-foreground/50">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>

      {open && (
        <div className="rounded-xl border border-border/40 bg-card/40 p-4 space-y-4">
          {/* Tab bar */}
          <div className="flex gap-1 border-b border-border/40 pb-3">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  tab === t.id
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/30',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {tab === 'per-agent' && (
            <PerAgentTab agentList={agentList} models={models} saving={saving} onSetAgentModel={onSetAgentModel} />
          )}
          {tab === 'heartbeat' && (
            <HeartbeatTab
              heartbeatModel={heartbeatModel}
              models={models}
              saving={saving}
              onSetHeartbeatModel={onSetHeartbeatModel}
            />
          )}
          {tab === 'routing' && (
            <RoutingSection
              defaultModel={defaultModel}
              imageModel={imageModel}
              models={models}
              saving={saving}
              saveError={saveError}
              onSetDefaultModel={onSetDefaultModel}
              onAddDefaultFallback={onAddDefaultFallback}
              onRemoveDefaultFallback={onRemoveDefaultFallback}
              onSetImageModel={onSetImageModel}
              onAddImageFallback={onAddImageFallback}
              onRemoveImageFallback={onRemoveImageFallback}
            />
          )}
        </div>
      )}
    </div>
  )
}
