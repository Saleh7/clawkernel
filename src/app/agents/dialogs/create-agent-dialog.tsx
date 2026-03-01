import { AlertCircle, FolderOpen, Plus, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { GatewayClient } from '@/lib/gateway/client'
import type { AgentsCreateResult, AgentsListResult } from '@/lib/gateway/types'
import { createLogger } from '@/lib/logger'
import { defaultWorkspacePath } from '@/lib/paths'
import { useGatewayStore } from '@/stores/gateway-store'
import { normalizeAgentId } from '../utils'

const log = createLogger('agents:create')

type Props = {
  client: GatewayClient | null
  onCreated?: (agentId: string) => void
}

export function CreateAgentDialog({ client, onCreated }: Props) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [workspaceManual, setWorkspaceManual] = useState(false)
  const [workspaceOverride, setWorkspaceOverride] = useState('')
  const [emoji, setEmoji] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const agentId = normalizeAgentId(name)
  const autoWorkspace = agentId ? defaultWorkspacePath(agentId) : ''
  const workspace = workspaceManual ? workspaceOverride : autoWorkspace
  const isValid = name.trim().length >= 2 && workspace.trim().length > 0

  const reset = () => {
    setName('')
    setWorkspaceManual(false)
    setWorkspaceOverride('')
    setEmoji('')
    setError(null)
    setCreating(false)
  }

  const handleCreate = async () => {
    if (!client || !isValid) return
    setCreating(true)
    setError(null)

    try {
      await client.request<AgentsCreateResult>('agents.create', {
        name: name.trim(),
        workspace: workspace.trim(),
        ...(emoji.trim() ? { emoji: emoji.trim() } : {}),
      })

      const r = await client.request<AgentsListResult>('agents.list', {})
      useGatewayStore.getState().setAgents(r)

      setOpen(false)
      reset()
      onCreated?.(agentId)
    } catch (err) {
      log.error('Agent creation failed', err)
      const msg = err instanceof Error ? err.message : 'Failed to create agent'
      setError(msg)
    }
    setCreating(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) reset()
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5 rounded-full px-3">
          <Plus className="h-3.5 w-3.5" />
          New Agent
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Create Agent
          </DialogTitle>
          <DialogDescription>Set up a new agent with its own workspace, identity, and configuration.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="agent-name">Name</Label>
            <Input
              id="agent-name"
              placeholder="e.g. Research Assistant"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            {name.trim() && (
              <p className="text-[11px] text-muted-foreground">
                Agent ID:{' '}
                <Badge variant="outline" className="font-mono text-[10px] ml-1">
                  {agentId || '—'}
                </Badge>
              </p>
            )}
          </div>

          {/* Workspace */}
          <div className="space-y-2">
            <Label htmlFor="agent-workspace" className="flex items-center gap-1.5">
              <FolderOpen className="h-3.5 w-3.5" />
              Workspace Path
            </Label>
            <Input
              id="agent-workspace"
              placeholder={`e.g. ${defaultWorkspacePath('research')}`}
              value={workspace}
              onChange={(e) => {
                setWorkspaceManual(true)
                setWorkspaceOverride(e.target.value)
              }}
              className="font-mono text-sm"
            />
            <p className="text-[10px] text-muted-foreground">
              {workspaceManual
                ? 'Custom path. Created automatically if missing.'
                : 'Auto-generated from name. Edit to customize.'}
            </p>
          </div>

          {/* Emoji */}
          <div className="space-y-2">
            <Label htmlFor="agent-emoji">Emoji (optional)</Label>
            <Input
              id="agent-emoji"
              placeholder="e.g. 🔬"
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              className="text-lg"
              maxLength={8}
            />
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5">
              <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-xs text-destructive">{error}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setOpen(false)
              reset()
            }}
            disabled={creating}
          >
            Cancel
          </Button>
          <Button onClick={() => void handleCreate()} disabled={creating || !isValid} className="gap-1.5">
            {creating ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Creating…
              </>
            ) : (
              <>
                <Plus className="h-3.5 w-3.5" />
                Create Agent
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
