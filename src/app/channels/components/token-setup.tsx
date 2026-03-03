import { Eye, EyeOff, Save } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { GatewayClient } from '@/lib/gateway/client'
import type { ConfigSnapshot } from '@/lib/gateway/types'
import { createLogger } from '@/lib/logger'
import { useGatewayStore } from '@/stores/gateway-store'
import { CHANNEL_META } from '../types'

const log = createLogger('token-setup')

type Props = {
  readonly channelId: string
  readonly label: string
  readonly client: GatewayClient | null
  readonly onRefresh: () => void
}

export function TokenSetup({ channelId, label, client, onRefresh }: Props) {
  const config = useGatewayStore((s) => s.config)
  const fields = CHANNEL_META[channelId]?.tokenFields
  const [values, setValues] = useState<Record<string, string>>({})
  const [showToken, setShowToken] = useState(false)
  const [saving, setSaving] = useState(false)

  if (!fields) return null

  const hasValue = fields.some((f) => values[f.key]?.trim())

  const handleSave = async () => {
    if (!client?.connected || !config || !hasValue) return
    setSaving(true)
    try {
      const channelPatch: Record<string, unknown> = {}
      for (const f of fields) {
        const v = values[f.key]?.trim()
        if (v) channelPatch[f.key] = v
      }
      const patch = { channels: { [channelId]: channelPatch } }
      await client.request('config.patch', {
        raw: JSON.stringify(patch),
        baseHash: config.hash,
      })
      const freshConfig = await client.request<ConfigSnapshot>('config.get', {})
      useGatewayStore.getState().setConfig(freshConfig)
      setValues({})
      toast.success(`${label} token saved — gateway will reconnect`)
      onRefresh()
    } catch (err) {
      toast.error('Token save failed')
      log.error('Token save failed', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-2">
      {fields.map((f) => (
        <div key={f.key} className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">{f.label}</Label>
          <div className="flex gap-1.5">
            <Input
              type={showToken ? 'text' : 'password'}
              placeholder={f.placeholder}
              value={values[f.key] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              className="h-7 font-mono text-xs"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={() => setShowToken((v) => !v)}
            >
              {showToken ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            </Button>
          </div>
        </div>
      ))}
      <Button size="sm" className="h-7 gap-1 text-xs" disabled={!hasValue || saving} onClick={() => void handleSave()}>
        <Save className="h-3 w-3" />
        {saving ? 'Saving…' : 'Save'}
      </Button>
    </div>
  )
}
