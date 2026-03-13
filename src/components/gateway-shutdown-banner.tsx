import { AlertTriangle, Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useGatewayStore } from '@/stores/gateway-store'

/**
 * Banner displayed when the gateway broadcasts a `shutdown` event.
 * Shows reason + countdown until expected restart.
 * Auto-clears when gateway reconnects (gatewayShutdown → null on hello-ok).
 *
 * Source: OpenClaw src/gateway/server-close.ts:84 (shutdown broadcast)
 */
export function GatewayShutdownBanner() {
  const shutdown = useGatewayStore((s) => s.gatewayShutdown)
  const [remainingMs, setRemainingMs] = useState<number | null>(null)
  // Track the shutdown object identity so we reset the timestamp on each new shutdown.
  // useState initializer only runs on mount — using a ref + effect avoids stale timestamps
  // when the component stays mounted across shutdown → null → shutdown transitions.
  const appearedAtRef = useRef(Date.now())
  const prevShutdownRef = useRef(shutdown)

  useEffect(() => {
    if (shutdown && shutdown !== prevShutdownRef.current) {
      appearedAtRef.current = Date.now()
    }
    prevShutdownRef.current = shutdown
  }, [shutdown])

  useEffect(() => {
    if (!shutdown?.restartExpectedMs) {
      setRemainingMs(null)
      return
    }

    const target = appearedAtRef.current + shutdown.restartExpectedMs

    function tick() {
      const left = Math.max(0, target - Date.now())
      setRemainingMs(left)
    }

    tick()
    const id = setInterval(tick, 500)
    return () => clearInterval(id)
  }, [shutdown])

  if (!shutdown) return null

  const reason = shutdown.reason || 'Gateway is shutting down'
  const hasCountdown = shutdown.restartExpectedMs != null && remainingMs != null
  const countdownSec = hasCountdown ? Math.ceil(remainingMs / 1000) : 0
  const isWaiting = hasCountdown && countdownSec > 0

  return (
    <div className="flex items-center justify-between gap-3 border-b border-destructive/20 bg-destructive/10 px-4 py-2 text-xs text-destructive">
      <span className="flex items-center gap-2">
        {isWaiting ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />
        ) : (
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        )}
        <span>
          {reason}
          {isWaiting && <span className="ml-1.5 font-mono">— restarting in {countdownSec}s</span>}
          {hasCountdown && !isWaiting && <span className="ml-1.5">— reconnecting…</span>}
        </span>
      </span>
    </div>
  )
}
