import { AlertCircle, Copy, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import type { GatewayClient } from '@/lib/gateway/client'
import type { AgentsCreateResult, AgentsListResult, ConfigSnapshot } from '@/lib/gateway/types'
import { createLogger } from '@/lib/logger'
import { defaultWorkspacePath } from '@/lib/paths'
import { useGatewayStore } from '@/stores/gateway-store'
import { saveRawConfigWithRetry } from '../config-utils'
import type { ParsedConfig } from '../types'
import { normalizeAgentId } from '../utils'

// ---------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------

const log = createLogger('agents:clone')

type Props = {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly sourceAgentId: string
  readonly sourceAgentName: string
  readonly config: ConfigSnapshot | null
  readonly client: GatewayClient | null
  readonly onCloned?: (agentId: string) => void
}

function modelDescription(model: unknown): string {
  if (!model) return 'none'
  if (typeof model === 'string') return model
  if (typeof model !== 'object') return 'configured'

  const primary = (model as { primary?: unknown }).primary
  if (typeof primary === 'string' && primary) return primary
  return 'configured'
}

function toolsDescription(tools: unknown): string {
  if (!tools || typeof tools !== 'object') return 'default'
  const profile = (tools as { profile?: unknown }).profile
  return typeof profile === 'string' && profile ? profile : 'full'
}

// ---------------------------------------------------------------------------
//  CloneAgentDialog
// ---------------------------------------------------------------------------

export function CloneAgentDialog({
  open,
  onOpenChange,
  sourceAgentId,
  sourceAgentName,
  config,
  client,
  onCloned,
}: Props) {
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('')
  const [cloneModel, setCloneModel] = useState(true)
  const [cloneTools, setCloneTools] = useState(true)
  const [cloneSkills, setCloneSkills] = useState(true)
  const [cloneBindings, setCloneBindings] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const agentId = normalizeAgentId(name)
  const workspace = agentId ? defaultWorkspacePath(agentId) : ''
  const isValid = name.trim().length >= 2

  useEffect(() => {
    if (open) {
      setName(`${sourceAgentName} Copy`)
      setEmoji('')
      setCloneModel(true)
      setCloneTools(true)
      setCloneSkills(true)
      setCloneBindings(false)
      setError(null)
      setCreating(false)
    }
  }, [open, sourceAgentName])

  const cfg = config?.config as ParsedConfig | null | undefined
  const sourceEntry = cfg?.agents?.list?.find((a) => a.id === sourceAgentId)
  const sourceBindings = (cfg?.bindings ?? []).filter((b) => b?.agentId === sourceAgentId)

  const handleClone = async () => {
    if (!client?.connected || !isValid) return
    setCreating(true)
    setError(null)

    try {
      await client.request<AgentsCreateResult>('agents.create', {
        name: name.trim(),
        workspace: workspace.trim(),
        ...(emoji.trim() ? { emoji: emoji.trim() } : {}),
      })

      if (sourceEntry && (cloneModel || cloneTools || cloneSkills)) {
        const fresh = await saveRawConfigWithRetry(client, config!, (cur) => {
          const agentsSection = { ...((cur.agents ?? {}) as Record<string, unknown>) }
          const agentsList = [...((agentsSection.list ?? []) as Array<Record<string, unknown>>)]

          const newIdx = agentsList.findIndex((a) => a.id === agentId)
          if (newIdx >= 0) {
            const newEntry = { ...agentsList[newIdx] }
            if (cloneModel && sourceEntry.model) newEntry.model = sourceEntry.model
            if (cloneTools && sourceEntry.tools) newEntry.tools = sourceEntry.tools
            if (cloneSkills && sourceEntry.skills) newEntry.skills = sourceEntry.skills
            agentsList[newIdx] = newEntry
          }

          let bindings = (cur.bindings ?? []) as Array<Record<string, unknown>>
          if (cloneBindings && sourceBindings.length > 0) {
            bindings = [...bindings, ...sourceBindings.map((b) => ({ ...b, agentId }))]
          }

          return { ...cur, agents: { ...agentsSection, list: agentsList }, bindings }
        })
        useGatewayStore.getState().setConfig(fresh)
      }

      const al = await client.request<AgentsListResult>('agents.list', {})
      useGatewayStore.getState().setAgents(al)

      onOpenChange(false)
      onCloned?.(agentId)
    } catch (err) {
      log.error('Agent clone failed', err)
      setError(err instanceof Error ? err.message : 'Failed to clone agent')
    }
    setCreating(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Copy className="h-4 w-4 text-primary" />
            Clone Agent
          </DialogTitle>
          <DialogDescription className="text-xs">
            Create a new agent based on <span className="font-mono font-semibold">{sourceAgentId}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* New name */}
          <div className="space-y-1.5">
            <Label className="text-xs">New Agent Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Research Assistant"
              autoFocus
            />
            {name.trim() && (
              <p className="text-[10px] text-muted-foreground">
                ID: <span className="font-mono">{agentId || '—'}</span> · Workspace:{' '}
                <span className="font-mono">{workspace || '—'}</span>
              </p>
            )}
          </div>

          {/* Emoji */}
          <div className="space-y-1.5">
            <Label className="text-xs">Emoji (optional)</Label>
            <Input
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              placeholder="🔬"
              className="text-lg w-20"
              maxLength={8}
            />
          </div>

          <Separator className="opacity-30" />

          {/* Clone options */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Clone Settings</p>
            <div className="space-y-2">
              <ToggleOption
                label="Model Configuration"
                description={modelDescription(sourceEntry?.model)}
                checked={cloneModel}
                onChange={setCloneModel}
              />
              <ToggleOption
                label="Tool Profile"
                description={toolsDescription(sourceEntry?.tools)}
                checked={cloneTools}
                onChange={setCloneTools}
              />
              <ToggleOption
                label="Skill Allowlist"
                description={
                  Array.isArray(sourceEntry?.skills) ? `${sourceEntry.skills.length} filtered` : 'all enabled'
                }
                checked={cloneSkills}
                onChange={setCloneSkills}
              />
              <ToggleOption
                label="Channel Bindings"
                description={`${sourceBindings.length} bindings`}
                checked={cloneBindings}
                onChange={setCloneBindings}
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={creating}>
            Cancel
          </Button>
          <Button size="sm" disabled={!isValid || creating} onClick={() => void handleClone()} className="gap-1.5">
            {creating ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Cloning…
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" /> Clone Agent
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ToggleOption({
  label,
  description,
  checked,
  onChange,
}: {
  readonly label: string
  readonly description: string
  readonly checked: boolean
  readonly onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between rounded-lg border border-border/40 bg-background/50 px-3 py-2.5 text-left transition-all hover:border-border"
    >
      <div>
        <p className="text-xs font-medium text-foreground">{label}</p>
        <p className="text-[10px] text-muted-foreground/60">{description}</p>
      </div>
      <div
        className={`flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-muted'}`}
      >
        <div
          className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`}
        />
      </div>
    </button>
  )
}
