import { Pencil } from 'lucide-react'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'
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
import { createLogger } from '@/lib/logger'

const log = createLogger('agents:update')

/**
 * Dialog for updating agent config (name, model, workspace).
 * Source: OpenClaw src/gateway/protocol/schema/agents-models-skills.ts (AgentsUpdateParamsSchema)
 * Params: { agentId, name?, workspace?, model?, avatar? }
 */

type Props = {
  readonly agentId: string
  readonly currentName?: string
  readonly currentModel?: string | null
  readonly client: GatewayClient | null
  readonly onUpdated?: () => void
}

type UpdateResult = { ok: boolean; agentId: string }

export function UpdateAgentDialog({ agentId, currentName, currentModel, client, onUpdated }: Props) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [model, setModel] = useState('')
  const [busy, setBusy] = useState(false)

  const handleOpen = useCallback(
    (isOpen: boolean) => {
      if (isOpen) {
        setName(currentName ?? '')
        setModel(currentModel ?? '')
      }
      setOpen(isOpen)
    },
    [currentName, currentModel],
  )

  const handleSave = useCallback(async () => {
    if (!client?.connected) return

    const params: Record<string, string> = { agentId }
    const trimmedName = name.trim()
    const trimmedModel = model.trim()

    if (trimmedName && trimmedName !== (currentName ?? '')) {
      params.name = trimmedName
    }
    if (trimmedModel && trimmedModel !== (currentModel ?? '')) {
      params.model = trimmedModel
    }

    // Nothing changed — inform user instead of silently closing
    if (!params.name && !params.model) {
      toast.info('No changes to save')
      return
    }

    setBusy(true)
    try {
      await client.request<UpdateResult>('agents.update', params)
      toast.success('Agent updated')
      setOpen(false)
      onUpdated?.()
    } catch (err) {
      toast.error('Update failed')
      log.error('agents.update failed', err)
    } finally {
      setBusy(false)
    }
  }, [client, agentId, name, model, currentName, currentModel, onUpdated])

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Pencil className="h-3.5 w-3.5" />
          Edit Config
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Agent — {agentId}</DialogTitle>
          <DialogDescription>Update agent name or model. Changes are written to the gateway config.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label htmlFor="agent-name" className="text-xs">
              Name
            </Label>
            <Input
              id="agent-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Display name"
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="agent-model" className="text-xs">
              Model
            </Label>
            <Input
              id="agent-model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="e.g. anthropic/claude-sonnet-4-6"
              className="h-8 text-sm"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button size="sm" disabled={busy} onClick={() => void handleSave()}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
