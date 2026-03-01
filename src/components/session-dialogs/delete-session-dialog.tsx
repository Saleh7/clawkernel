import { useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import type { GatewayClient } from '@/lib/gateway/client'
import type { GatewaySessionRow } from '@/lib/gateway/types'
import { createLogger } from '@/lib/logger'
import { deleteSession } from '@/lib/session-ops'
import { useSessionDialogClient } from './use-session-dialog-client'

interface DeleteSessionDialogProps {
  session: GatewaySessionRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Optional — if omitted, falls back to the gateway store client */
  client?: GatewayClient | null
  /** Called after a successful delete */
  onDeleted?: () => void
}

const log = createLogger('sessions:delete-dialog')

export function DeleteSessionDialog({
  open,
  onOpenChange,
  session,
  client: clientProp,
  onDeleted,
}: DeleteSessionDialogProps) {
  const client = useSessionDialogClient(clientProp)
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (!client?.connected || !session) return
    setDeleting(true)
    try {
      await deleteSession(client, session.key)
      onDeleted?.()
      onOpenChange(false)
    } catch (err) {
      log.warn('sessions.delete failed', err, { sessionKey: session.key })
      toast.error('Failed to delete session')
    }
    setDeleting(false)
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Delete Session"
      description={
        <div className="space-y-2 text-sm text-muted-foreground">
          <span>This will permanently delete the session and its transcript.</span>
          <span className="block font-mono text-[11px] break-all rounded-md border border-border/50 bg-muted/30 px-2 py-1.5">
            {session?.key}
          </span>
        </div>
      }
      confirmText="delete"
      actionLabel="Delete Session"
      loadingLabel="Deleting..."
      loading={deleting}
      onConfirm={handleDelete}
    />
  )
}
