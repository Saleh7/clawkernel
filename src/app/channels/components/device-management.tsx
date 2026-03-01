import { Check, Copy, KeyRound, Monitor, RotateCw, Smartphone, Trash2, X } from 'lucide-react'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatRelativeTime } from '@/lib/format'
import type { GatewayClient } from '@/lib/gateway/client'
import { createLogger } from '@/lib/logger'
import type { DevicePendingRequest, PairedDevice, TokenRotateResult } from '../types'

const log = createLogger('device-mgmt')

function PlatformIcon({ platform, className }: { platform?: string; className?: string }) {
  const p = (platform ?? '').toLowerCase()
  if (p.includes('iphone') || p.includes('ios') || p.includes('android')) {
    return <Smartphone className={className} />
  }
  return <Monitor className={className} />
}

type Props = {
  pending: DevicePendingRequest[]
  paired: PairedDevice[]
  busy: string | null
  client: GatewayClient | null
  onApprove: (requestId: string) => Promise<void>
  onReject: (requestId: string) => Promise<void>
  onRemove: (deviceId: string) => Promise<void>
  onRefresh: () => void
}

export function DeviceManagement({ pending, paired, busy, client, onApprove, onReject, onRemove, onRefresh }: Props) {
  const [rejectTarget, setRejectTarget] = useState<string | null>(null)
  const [removeTarget, setRemoveTarget] = useState<string | null>(null)
  const [revokeTarget, setRevokeTarget] = useState<{ deviceId: string; role: string } | null>(null)
  const [rotatedToken, setRotatedToken] = useState<string | null>(null)

  const handleApprove = async (requestId: string) => {
    try {
      await onApprove(requestId)
      toast.success('Device approved')
    } catch {
      toast.error('Approve failed')
    }
  }

  const handleReject = async () => {
    if (!rejectTarget) return
    try {
      await onReject(rejectTarget)
      toast.success('Device rejected')
    } catch {
      toast.error('Reject failed')
    } finally {
      setRejectTarget(null)
    }
  }

  const handleRemove = async () => {
    if (!removeTarget) return
    try {
      await onRemove(removeTarget)
      toast.success('Device removed')
    } catch {
      toast.error('Remove failed')
    } finally {
      setRemoveTarget(null)
    }
  }

  const handleRotate = useCallback(
    async (deviceId: string, role: string) => {
      if (!client?.connected) return
      try {
        const result = await client.request<TokenRotateResult>('device.token.rotate', { deviceId, role })
        setRotatedToken(result.token)
        toast.success("Token rotated — copy it now, it won't be shown again")
        onRefresh()
      } catch (err) {
        toast.error('Token rotation failed')
        log.error('Token rotate failed', err)
      }
    },
    [client, onRefresh],
  )

  const handleRevoke = useCallback(async () => {
    if (!client?.connected || !revokeTarget) return
    try {
      await client.request('device.token.revoke', revokeTarget)
      toast.success('Token revoked')
      onRefresh()
    } catch (err) {
      toast.error('Token revoke failed')
      log.error('Token revoke failed', err)
    } finally {
      setRevokeTarget(null)
    }
  }, [client, revokeTarget, onRefresh])

  const copyToken = () => {
    if (rotatedToken) {
      navigator.clipboard.writeText(rotatedToken)
      toast.success('Token copied')
      setRotatedToken(null)
    }
  }

  return (
    <div className="space-y-4">
      {pending.length > 0 && (
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
          <CardHeader className="px-4 pb-2 pt-4">
            <CardTitle className="text-sm font-semibold">
              Pending Requests
              <Badge variant="secondary" className="ml-2 text-[10px]">
                {pending.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="space-y-2">
              {pending.map((d) => (
                <div key={d.requestId} className="flex items-center gap-3 rounded-lg border border-border/50 px-3 py-2">
                  <PlatformIcon platform={d.platform} className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium">{d.displayName ?? d.deviceId}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {d.platform ?? '—'} · {d.role ?? 'operator'} · {formatRelativeTime(d.ts)}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-success hover:bg-success/10"
                      disabled={busy === d.requestId}
                      onClick={() => void handleApprove(d.requestId)}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:bg-destructive/10"
                      disabled={busy === d.requestId}
                      onClick={() => setRejectTarget(d.requestId)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {paired.length > 0 && (
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
          <CardHeader className="px-4 pb-2 pt-4">
            <CardTitle className="text-sm font-semibold">
              Paired Devices
              <Badge variant="secondary" className="ml-2 text-[10px]">
                {paired.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="space-y-2">
              {paired.map((d) => (
                <div key={d.deviceId} className="flex items-center gap-3 rounded-lg border border-border/50 px-3 py-2">
                  <PlatformIcon platform={d.platform} className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium">{d.displayName ?? d.deviceId}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {d.platform ?? '—'} · {d.role ?? 'operator'} · approved {formatRelativeTime(d.approvedAtMs)}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title="Rotate token"
                      onClick={() => void handleRotate(d.deviceId, d.role ?? 'operator')}
                    >
                      <RotateCw className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title="Revoke token"
                      onClick={() => setRevokeTarget({ deviceId: d.deviceId, role: d.role ?? 'operator' })}
                    >
                      <KeyRound className="h-3 w-3 text-warning" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      title="Remove device"
                      onClick={() => setRemoveTarget(d.deviceId)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {rotatedToken && (
        <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2">
          <KeyRound className="h-4 w-4 shrink-0 text-warning" />
          <code className="flex-1 truncate font-mono text-xs">{rotatedToken}</code>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={copyToken}>
            <Copy className="h-3 w-3" />
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={rejectTarget !== null}
        onOpenChange={(v) => {
          if (!v) setRejectTarget(null)
        }}
        title="Reject Device"
        description="This device will be denied access. It can request pairing again."
        actionLabel="Reject"
        variant="destructive"
        onConfirm={() => void handleReject()}
      />
      <ConfirmDialog
        open={removeTarget !== null}
        onOpenChange={(v) => {
          if (!v) setRemoveTarget(null)
        }}
        title="Remove Device"
        description="This will unpair the device and revoke all its tokens. The device will need to pair again."
        actionLabel="Remove"
        variant="destructive"
        onConfirm={() => void handleRemove()}
      />
      <ConfirmDialog
        open={revokeTarget !== null}
        onOpenChange={(v) => {
          if (!v) setRevokeTarget(null)
        }}
        title="Revoke Token"
        description="The device will lose access until a new token is rotated."
        actionLabel="Revoke"
        variant="destructive"
        onConfirm={() => void handleRevoke()}
      />
    </div>
  )
}
