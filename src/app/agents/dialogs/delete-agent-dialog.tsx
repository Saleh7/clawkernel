import { AlertTriangle, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import type { GatewayClient } from '@/lib/gateway/client'
import type { AgentsDeleteResult, AgentsListResult } from '@/lib/gateway/types'
import { createLogger } from '@/lib/logger'
import { useGatewayStore } from '@/stores/gateway-store'

const log = createLogger('agents:delete')

type Props = {
  readonly agentId: string
  readonly agentName: string
  readonly isDefault: boolean
  readonly client: GatewayClient | null
  readonly onDeleted?: () => void
}

export function DeleteAgentDialog({ agentId, agentName, isDefault, client, onDeleted }: Props) {
  const [open, setOpen] = useState(false)
  const [deleteFiles, setDeleteFiles] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setDeleteFiles(false)
    setError(null)
    setDeleting(false)
  }

  const handleDelete = async () => {
    if (!client) return
    setDeleting(true)
    setError(null)

    try {
      await client.request<AgentsDeleteResult>('agents.delete', {
        agentId,
        deleteFiles,
      })

      const r = await client.request<AgentsListResult>('agents.list', {})
      useGatewayStore.getState().setAgents(r)

      setOpen(false)
      reset()
      onDeleted?.()
    } catch (err) {
      log.error('Agent deletion failed', err)
      setError(err instanceof Error ? err.message : 'Failed to delete agent')
    }
    setDeleting(false)
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        disabled={isDefault}
        className="gap-1.5 rounded-lg border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={() => {
          reset()
          setDeleteFiles(true)
          setOpen(true)
        }}
      >
        <Trash2 className="h-3.5 w-3.5" />
        Delete
      </Button>

      <ConfirmDialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v)
          if (!v) reset()
        }}
        title="Delete Agent"
        description={
          <div className="space-y-3">
            <p>
              This will permanently remove <strong className="text-foreground">{agentName}</strong> ({agentId}) from the
              gateway configuration.
            </p>
            <p>All channel bindings for this agent will be removed. This action cannot be undone.</p>
          </div>
        }
        confirmText={agentId}
        actionLabel="Delete Agent"
        loadingLabel="Deleting…"
        loading={deleting}
        onConfirm={handleDelete}
      >
        {/* Delete files checkbox */}
        <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/30 p-3">
          <input
            id="delete-files-checkbox"
            type="checkbox"
            checked={deleteFiles}
            onChange={(e) => setDeleteFiles(e.target.checked)}
            aria-describedby="delete-files-checkbox-help"
            className="mt-0.5 h-4 w-4 rounded border-border accent-destructive"
          />
          <div>
            <label htmlFor="delete-files-checkbox" className="cursor-pointer text-sm font-medium text-foreground">
              Also delete workspace files
            </label>
            <p id="delete-files-checkbox-help" className="mt-0.5 text-[11px] text-muted-foreground">
              Moves workspace directory, agent dir, and session transcripts to trash.
            </p>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-xs text-destructive">{error}</p>
          </div>
        )}
      </ConfirmDialog>
    </>
  )
}
