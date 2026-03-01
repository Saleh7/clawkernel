import { useState } from 'react'
import { toast } from 'sonner'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { GatewayClient } from '@/lib/gateway/client'
import type { ConfigSnapshot } from '@/lib/gateway/types'
import { createLogger } from '@/lib/logger'
import { useGatewayStore } from '@/stores/gateway-store'

const log = createLogger('channel-settings')

const DM_POLICIES = ['pairing', 'allow', 'deny'] as const
const GROUP_POLICIES = ['allow', 'mention', 'deny'] as const

type Props = {
  channelId: string
  client: GatewayClient | null
  onRefresh: () => void
}

export function ChannelSettings({ channelId, client, onRefresh }: Props) {
  const config = useGatewayStore((s) => s.config)
  const [busy, setBusy] = useState(false)

  const channelConfig = ((config?.config as Record<string, unknown>)?.channels as Record<string, unknown>)?.[
    channelId
  ] as Record<string, unknown> | undefined

  const currentDm = (channelConfig?.dmPolicy as string) ?? 'pairing'
  const currentGroup = (channelConfig?.groupPolicy as string) ?? 'allow'

  const setPolicy = async (field: 'dmPolicy' | 'groupPolicy', value: string) => {
    if (!client?.connected || !config) return
    setBusy(true)
    try {
      const patch = { channels: { [channelId]: { [field]: value } } }
      await client.request('config.patch', {
        raw: JSON.stringify(patch),
        baseHash: config.hash,
      })
      const freshConfig = await client.request<ConfigSnapshot>('config.get', {})
      useGatewayStore.getState().setConfig(freshConfig)
      toast.success(`${field === 'dmPolicy' ? 'DM' : 'Group'} policy updated`)
      onRefresh()
    } catch (err) {
      toast.error('Policy update failed')
      log.error('Policy update failed', err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1">
        <Label className="text-[10px] text-muted-foreground">DM Policy</Label>
        <Select value={currentDm} disabled={busy} onValueChange={(v) => void setPolicy('dmPolicy', v)}>
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DM_POLICIES.map((p) => (
              <SelectItem key={p} value={p} className="text-xs">
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-[10px] text-muted-foreground">Group Policy</Label>
        <Select value={currentGroup} disabled={busy} onValueChange={(v) => void setPolicy('groupPolicy', v)}>
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GROUP_POLICIES.map((p) => (
              <SelectItem key={p} value={p} className="text-xs">
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
