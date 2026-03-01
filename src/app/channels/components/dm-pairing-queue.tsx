import { Check, UserPlus } from 'lucide-react'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { saveRawConfigWithRetry } from '@/app/agents/config-utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatRelativeTime } from '@/lib/format'
import type { GatewayClient } from '@/lib/gateway/client'
import { createLogger } from '@/lib/logger'
import { useGatewayStore } from '@/stores/gateway-store'
import { CHANNEL_ICONS } from '../types'

const log = createLogger('dm-pairing')

type DmRequest = {
  channel: string
  code: string
  senderId?: string
  senderName?: string
  message?: string
  createdAt?: string
}

type Props = {
  client: GatewayClient | null
  onRefresh: () => void
}

export function DmPairingQueue({ client, onRefresh }: Props) {
  const config = useGatewayStore((s) => s.config)
  const channels = useGatewayStore((s) => s.channels)
  const [busy, setBusy] = useState<string | null>(null)

  const dmRequests: DmRequest[] = []
  if (channels?.channelAccounts) {
    for (const [channelId, accounts] of Object.entries(channels.channelAccounts)) {
      for (const account of accounts) {
        const raw = account as Record<string, unknown>
        const pendingPairs = raw.pendingPairings as DmRequest[] | undefined
        if (Array.isArray(pendingPairs)) {
          for (const p of pendingPairs) {
            dmRequests.push({ ...p, channel: channelId })
          }
        }
      }
    }
  }

  const handleApprove = useCallback(
    async (channel: string, code: string) => {
      if (!client?.connected || !config) return
      const key = `${channel}:${code}`
      setBusy(key)
      try {
        const updated = await saveRawConfigWithRetry(client, config, (current) => {
          const channels = { ...((current.channels as Record<string, unknown>) ?? {}) }
          const ch = { ...((channels[channel] as Record<string, unknown>) ?? {}) }
          const allowFrom = [...((ch.allowFrom as string[]) ?? [])]
          if (!allowFrom.includes(code)) allowFrom.push(code)
          ch.allowFrom = allowFrom
          channels[channel] = ch
          return { ...current, channels }
        })
        useGatewayStore.getState().setConfig(updated)
        toast.success(`Approved ${code} on ${channel}`)
        onRefresh()
      } catch (err) {
        toast.error('Approve failed')
        log.error('DM approve failed', err)
      } finally {
        setBusy(null)
      }
    },
    [client, config, onRefresh],
  )

  if (dmRequests.length === 0) return null

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader className="px-4 pb-2 pt-4">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <UserPlus className="h-4 w-4 text-primary" />
          DM Pairing Queue
          <Badge variant="secondary" className="text-[10px]">
            {dmRequests.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="space-y-2">
          {dmRequests.map((r) => {
            const key = `${r.channel}:${r.code}`
            const icon = CHANNEL_ICONS[r.channel] ?? '📡'
            return (
              <div key={key} className="flex items-center gap-3 rounded-lg border border-border/50 px-3 py-2">
                <span className="text-sm">{icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium">{r.senderName ?? r.code}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {r.channel} · {r.code}
                    {r.createdAt && ` · ${formatRelativeTime(new Date(r.createdAt).getTime())}`}
                  </div>
                  {r.message && (
                    <div className="mt-0.5 truncate text-[10px] text-muted-foreground italic">{r.message}</div>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-success hover:bg-success/10"
                  disabled={busy === key}
                  onClick={() => void handleApprove(r.channel, r.code)}
                >
                  <Check className="h-3.5 w-3.5" />
                </Button>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
