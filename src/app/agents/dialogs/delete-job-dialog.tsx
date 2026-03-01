import { useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import type { GatewayClient } from '@/lib/gateway/client'
import type { CronJob } from '@/lib/gateway/types'
import { log, refreshCron } from '../cron-utils'

export function DeleteJobDialog({
  job,
  open,
  onOpenChange,
  client,
}: {
  job: CronJob | null
  open: boolean
  onOpenChange: (v: boolean) => void
  client: GatewayClient | null
}) {
  const [busy, setBusy] = useState(false)

  const handleDelete = async () => {
    if (!client || !job) return
    setBusy(true)
    try {
      await client.request('cron.remove', { jobId: job.id })
      await refreshCron(client)
      onOpenChange(false)
    } catch (err) {
      log.warn('Delete cron job failed', err)
      toast.error('Failed to delete cron job')
    }
    setBusy(false)
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Delete Cron Job"
      description={
        <>
          This will permanently delete <strong>{job?.name}</strong>. Type the job name to confirm.
        </>
      }
      confirmText={job?.name ?? ''}
      actionLabel="Delete"
      loadingLabel="Deleting…"
      loading={busy}
      onConfirm={handleDelete}
    />
  )
}
