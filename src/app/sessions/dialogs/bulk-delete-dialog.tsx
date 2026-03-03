import { useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { createLogger } from '@/lib/logger'
import { deleteSession } from '@/lib/session-ops'
import { selectClient, useGatewayStore } from '@/stores/gateway-store'
import type { BulkDeleteResult } from '../types'

const log = createLogger('sessions:bulk-delete-dialog')

export function BulkDeleteDialog({
  keys,
  open,
  onClose,
  onDone,
}: {
  readonly keys: string[]
  readonly open: boolean
  readonly onClose: () => void
  readonly onDone: (result: BulkDeleteResult) => void
}) {
  const client = useGatewayStore(selectClient)
  const [deleting, setDeleting] = useState(false)

  const expectedConfirm = `delete ${keys.length}`

  const doDelete = async () => {
    if (!client?.connected || deleting || keys.length === 0) return
    setDeleting(true)

    const settled = await Promise.allSettled(
      keys.map(async (key) => {
        await deleteSession(client, key)
        return key
      }),
    )

    const deletedKeys: string[] = []
    const failedKeys: string[] = []

    for (const [index, result] of settled.entries()) {
      if (result.status === 'fulfilled') {
        deletedKeys.push(result.value)
        continue
      }
      const failedKey = keys[index]
      failedKeys.push(failedKey)
      log.error('Bulk delete failed for session', result.reason, { sessionKey: failedKey })
    }

    if (failedKeys.length === 0) {
      toast.success(`Deleted ${deletedKeys.length} session${deletedKeys.length === 1 ? '' : 's'}`)
    } else if (deletedKeys.length > 0) {
      toast.error(`Deleted ${deletedKeys.length} sessions, failed ${failedKeys.length}. Check logs.`)
    } else {
      toast.error('Failed to delete selected sessions')
    }

    onDone({ deletedKeys, failedKeys })
    onClose()
    setDeleting(false)
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title={`Delete ${keys.length} Sessions`}
      description={
        <div className="space-y-2">
          <span className="block">
            This will permanently delete {keys.length} session{keys.length > 1 ? 's' : ''} and archive transcripts.
          </span>
        </div>
      }
      confirmText={expectedConfirm}
      actionLabel={`Delete ${keys.length}`}
      loadingLabel="Deleting..."
      loading={deleting}
      onConfirm={doDelete}
    />
  )
}
