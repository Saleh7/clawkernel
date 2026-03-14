import { Check, Copy, Fingerprint } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { createLogger } from '@/lib/logger'
import { selectClient, selectIsConnected, useGatewayStore } from '@/stores/gateway-store'

const log = createLogger('gateway:identity')

type GatewayIdentity = {
  deviceId: string
  publicKey: string
}

export function GatewayIdentityCard() {
  const client = useGatewayStore(selectClient)
  const connected = useGatewayStore(selectIsConnected)
  const [identity, setIdentity] = useState<GatewayIdentity | null>(null)
  const [copiedField, setCopiedField] = useState<string | null>(null)

  // biome-ignore lint/correctness/useExhaustiveDependencies: connected triggers re-fetch on reconnect
  useEffect(() => {
    if (!client?.connected) {
      setIdentity(null)
      return
    }
    let cancelled = false
    client
      .request<GatewayIdentity>('gateway.identity.get', {})
      .then((result) => {
        if (!cancelled) setIdentity(result)
      })
      .catch((err) => {
        log.warn('gateway.identity.get failed', err)
      })
    return () => {
      cancelled = true
    }
  }, [client, connected])

  const copyToClipboard = useCallback(async (value: string, field: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedField(field)
      toast.success(`${field} copied`)
      setTimeout(() => setCopiedField(null), 2000)
    } catch {
      toast.error('Failed to copy')
    }
  }, [])

  if (!identity) return null

  const shortDeviceId = identity.deviceId.slice(0, 8)
  const shortPublicKey = identity.publicKey.slice(0, 12)

  return (
    <div className="space-y-1.5 rounded-lg border border-border/50 bg-card/50 p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
        <Fingerprint className="h-3 w-3" />
        Gateway Identity
      </div>
      <CopyableField
        label="Device ID"
        value={identity.deviceId}
        display={shortDeviceId}
        copied={copiedField === 'Device ID'}
        onCopy={() => void copyToClipboard(identity.deviceId, 'Device ID')}
      />
      <CopyableField
        label="Public Key"
        value={identity.publicKey}
        display={shortPublicKey}
        copied={copiedField === 'Public Key'}
        onCopy={() => void copyToClipboard(identity.publicKey, 'Public Key')}
      />
    </div>
  )
}

function CopyableField({
  label,
  value,
  display,
  copied,
  onCopy,
}: {
  readonly label: string
  readonly value: string
  readonly display: string
  readonly copied: boolean
  readonly onCopy: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onCopy}
          className="flex w-full items-center justify-between rounded px-1.5 py-0.5 text-left transition-colors hover:bg-accent/50"
        >
          <div className="min-w-0">
            <div className="text-[9px] text-muted-foreground">{label}</div>
            <div className="truncate font-mono text-[10px]">{display}…</div>
          </div>
          {copied ? (
            <Check className="h-3 w-3 shrink-0 text-success" />
          ) : (
            <Copy className="h-3 w-3 shrink-0 text-muted-foreground" />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-xs">
        <p className="break-all font-mono text-[10px]">{value}</p>
        <p className="mt-1 text-[9px] text-muted-foreground">Click to copy</p>
      </TooltipContent>
    </Tooltip>
  )
}
