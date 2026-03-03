import { Bell, Check, Monitor, Smartphone, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { formatRelativeTime } from '@/lib/format'
import { createLogger } from '@/lib/logger'
import { cn } from '@/lib/utils'
import { selectClient, selectIsConnected, useGatewayStore } from '@/stores/gateway-store'

const log = createLogger('pairing-bell')
const POLL_MS = 15_000

type PendingDevice = {
  requestId: string
  deviceId?: string
  displayName?: string
  platform?: string
  role?: string
  roles?: string[]
  ts: number
}

type PairingData = {
  pending: PendingDevice[]
}

function PlatformIcon({ platform, className }: { readonly platform?: string; readonly className?: string }) {
  const p = (platform ?? '').toLowerCase()
  if (p.includes('iphone') || p.includes('ios') || p.includes('android')) {
    return <Smartphone className={className} />
  }
  return <Monitor className={className} />
}

export function PairingBell() {
  const client = useGatewayStore(selectClient)
  const connected = useGatewayStore(selectIsConnected)
  const [data, setData] = useState<PairingData>({ pending: [] })
  const [busy, setBusy] = useState<string | null>(null)
  const [rejectTarget, setRejectTarget] = useState<string | null>(null)
  const prevCountRef = useRef(0)

  const refresh = useCallback(async () => {
    if (!client?.connected) return
    try {
      const result = await client.request<PairingData>('device.pair.list', {})
      setData({ pending: result.pending ?? [] })
    } catch (err) {
      log.warn('Pairing poll failed', err)
    }
  }, [client])

  useEffect(() => {
    if (!connected) return
    refresh()
    const id = setInterval(() => {
      if (!document.hidden) refresh()
    }, POLL_MS)
    return () => clearInterval(id)
  }, [connected, refresh])

  const count = data.pending.length
  const isNew = count > prevCountRef.current
  useEffect(() => {
    prevCountRef.current = count
  }, [count])

  const handleApprove = useCallback(
    async (requestId: string) => {
      if (!client?.connected) return
      setBusy(requestId)
      try {
        await client.request('device.pair.approve', { requestId })
        toast.success('Device approved')
        await refresh()
      } catch (err) {
        toast.error('Approve failed')
        log.error('Approve failed', err)
      } finally {
        setBusy(null)
      }
    },
    [client, refresh],
  )

  const handleReject = useCallback(
    async (requestId: string) => {
      if (!client?.connected) return
      setBusy(requestId)
      try {
        await client.request('device.pair.reject', { requestId })
        toast.success('Device rejected')
        await refresh()
      } catch (err) {
        toast.error('Reject failed')
        log.error('Reject failed', err)
      } finally {
        setBusy(null)
        setRejectTarget(null)
      }
    },
    [client, refresh],
  )

  if (!connected) return null

  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              'relative flex items-center justify-center rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground',
              count > 0 && 'text-primary',
            )}
            title={count > 0 ? `${count} pending request${count > 1 ? 's' : ''}` : 'No pending requests'}
          >
            <Bell className={cn('h-4 w-4', isNew && 'animate-bounce')} />
            {count > 0 && (
              <Badge className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px]">
                {count}
              </Badge>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-0">
          <div className="px-3 py-2.5 text-sm font-semibold">Device Requests</div>
          <Separator />
          {data.pending.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">No pending requests</div>
          ) : (
            <div className="max-h-64 overflow-y-auto">
              {data.pending.map((d) => (
                <div
                  key={d.requestId}
                  className="flex items-start gap-2 border-b border-border/50 px-3 py-2.5 last:border-0"
                >
                  <PlatformIcon platform={d.platform} className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium">{d.displayName ?? d.deviceId ?? 'Unknown'}</div>
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <span>{d.platform ?? '—'}</span>
                      <span>·</span>
                      <span>{d.role ?? 'operator'}</span>
                      <span>·</span>
                      <span>{formatRelativeTime(d.ts)}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-success hover:bg-success/10"
                      disabled={busy === d.requestId}
                      onClick={() => handleApprove(d.requestId)}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive hover:bg-destructive/10"
                      disabled={busy === d.requestId}
                      onClick={() => setRejectTarget(d.requestId)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </PopoverContent>
      </Popover>

      <ConfirmDialog
        open={rejectTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRejectTarget(null)
        }}
        title="Reject Device"
        description="This device will be denied access. It can request pairing again."
        actionLabel="Reject"
        variant="destructive"
        onConfirm={() => {
          if (rejectTarget) void handleReject(rejectTarget)
        }}
      />
    </>
  )
}
