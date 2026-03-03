import { RefreshCw, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { createLogger } from '@/lib/logger'
import { useRestartBarStore } from '@/stores/restart-bar-store'

const log = createLogger('restart-bar')

interface RestartResponse {
  ok: boolean
  output?: string
  error?: string
}

/**
 * Announcement bar for manual gateway restart.
 * Triggered via useRestartBarStore.getState().show() after config changes
 * that require a restart but don't include restartDelayMs (auto-restart).
 */
export function RestartBar() {
  const { isVisible, hide } = useRestartBarStore()
  const [isRestarting, setIsRestarting] = useState(false)

  if (!isVisible) return null

  const handleRestart = async () => {
    setIsRestarting(true)
    try {
      const res = await fetch('/api/gateway/restart', { method: 'POST' })
      const data = (await res.json()) as RestartResponse
      if (data.ok) {
        toast.success('Gateway restarted successfully')
        hide()
      } else {
        toast.error(data.error ?? 'Gateway restart failed')
      }
    } catch (err) {
      log.error('Gateway restart request failed', err)
      toast.error('Could not reach the ClawKernel server')
    } finally {
      setIsRestarting(false)
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 border-b border-warning/20 bg-warning/10 px-4 py-2 text-xs text-warning">
      <span className="flex items-center gap-2">
        <RefreshCw className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Gateway restart may be required to apply configuration changes.
      </span>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={handleRestart}
          disabled={isRestarting}
          className="rounded border border-warning/30 bg-warning/15 px-3 py-1 text-xs font-medium text-warning transition-colors hover:bg-warning/25 disabled:opacity-50"
        >
          {isRestarting ? 'Restarting…' : 'Restart Gateway'}
        </button>
        <button
          type="button"
          onClick={hide}
          aria-label="Dismiss restart notification"
          className="rounded p-0.5 text-warning/60 transition-colors hover:bg-warning/10 hover:text-warning"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
