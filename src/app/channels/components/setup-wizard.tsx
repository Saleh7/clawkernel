import { Check, ExternalLink, Eye, EyeOff, Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import type { GatewayClient } from '@/lib/gateway/client'
import type { ChannelAccountSnapshot, ConfigSnapshot } from '@/lib/gateway/types'
import { createLogger } from '@/lib/logger'
import { cn } from '@/lib/utils'
import { useGatewayStore } from '@/stores/gateway-store'
import type { ChannelKnownMeta } from '../types'
import { CHANNEL_META } from '../types'
import { QrLoginDialog } from './qr-login-dialog'

const log = createLogger('setup-wizard')

type Step = 'choose' | 'configure' | 'done'

type ChannelOption = {
  id: string
  label: string
  configured: boolean
  meta: ChannelKnownMeta
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  channelOrder: string[]
  channelLabels: Record<string, string>
  channelAccounts: Record<string, ChannelAccountSnapshot[]>
  client: GatewayClient | null
  onRefresh: () => void
}

export function SetupWizard({
  open,
  onOpenChange,
  channelOrder,
  channelLabels,
  channelAccounts,
  client,
  onRefresh,
}: Props) {
  const config = useGatewayStore((s) => s.config)
  const [step, setStep] = useState<Step>('choose')
  const [selected, setSelected] = useState<string | null>(null)
  const [tokens, setTokens] = useState<Record<string, string>>({})
  const [showToken, setShowToken] = useState(false)
  const [saving, setSaving] = useState(false)

  const configuredSet = new Set(channelOrder)

  const channels: ChannelOption[] = Object.entries(CHANNEL_META).map(([id, meta]) => ({
    id,
    label: channelLabels[id] ?? id.charAt(0).toUpperCase() + id.slice(1),
    configured: configuredSet.has(id) && (channelAccounts[id] ?? []).some((a) => a.configured),
    meta,
  }))

  const current = channels.find((c) => c.id === selected)

  const reset = () => {
    setStep('choose')
    setSelected(null)
    setTokens({})
    setShowToken(false)
    setSaving(false)
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) reset()
    onOpenChange(next)
  }

  const handleSelect = (id: string) => {
    setSelected(id)
    setTokens({})
  }

  const handleSaveToken = async () => {
    const fields = current?.meta.tokenFields
    if (!client?.connected || !config || !fields) return
    if (!fields.some((f) => tokens[f.key]?.trim())) return

    setSaving(true)
    try {
      const channelPatch: Record<string, unknown> = { enabled: true }
      for (const f of fields) {
        const v = tokens[f.key]?.trim()
        if (v) channelPatch[f.key] = v
      }
      const patch = { channels: { [current.id]: channelPatch } }
      await client.request('config.patch', {
        raw: JSON.stringify(patch),
        baseHash: config.hash,
      })
      const freshConfig = await client.request<ConfigSnapshot>('config.get', {})
      useGatewayStore.getState().setConfig(freshConfig)
      toast.success(`${current.label} configured — gateway reconnecting`)
      onRefresh()
      setStep('done')
    } catch (err) {
      toast.error('Setup failed')
      log.error('Token save failed', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-primary" />
            {step === 'choose'
              ? 'Add Channel'
              : step === 'configure'
                ? `Setup ${current?.label ?? ''}`
                : 'Setup Complete'}
          </DialogTitle>
          <DialogDescription>
            {step === 'choose' && 'Pick a channel to connect.'}
            {step === 'configure' && current?.meta.setupHint}
            {step === 'done' && `${current?.label} has been configured.`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 text-xs">
          {(['choose', 'configure', 'done'] as const).map((s, i) => (
            <div key={s} className="flex items-center gap-1.5">
              <span
                className={cn(
                  'flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold',
                  step === s || ['configure', 'done'].indexOf(step) >= i
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground',
                )}
              >
                {i + 1}
              </span>
              <span className="text-muted-foreground">
                {s === 'choose' ? 'Choose' : s === 'configure' ? 'Configure' : 'Done'}
              </span>
              {i < 2 && <span className="text-muted-foreground/40">→</span>}
            </div>
          ))}
        </div>

        <Separator />

        {/* Step 1: Choose */}
        {step === 'choose' && (
          <div className="space-y-2">
            {channels.map((ch) => (
              <button
                key={ch.id}
                type="button"
                onClick={() => handleSelect(ch.id)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
                  selected === ch.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent/50',
                )}
              >
                <span className="text-lg">{ch.meta.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{ch.label}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {ch.meta.setupType === 'token'
                      ? 'Token setup'
                      : ch.meta.setupType === 'qr'
                        ? 'QR login'
                        : 'CLI setup'}
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    'text-[10px]',
                    ch.configured
                      ? 'border-success/20 bg-success/10 text-success'
                      : 'border-warning/20 bg-warning/10 text-warning',
                  )}
                >
                  {ch.configured ? 'Configured' : 'Needs setup'}
                </Badge>
              </button>
            ))}
            <div className="flex justify-end pt-2">
              <Button size="sm" disabled={!selected} onClick={() => setStep('configure')}>
                Next
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Configure */}
        {step === 'configure' && current && (
          <div className="space-y-4">
            {current.meta.docsUrl && (
              <a
                href={current.meta.docsUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                Channel docs
              </a>
            )}

            {current.meta.setupType === 'token' && current.meta.tokenFields && (
              <div className="space-y-3">
                {current.meta.tokenFields.map((f) => (
                  <div key={f.key} className="space-y-1">
                    <Label className="text-xs">{f.label}</Label>
                    <div className="flex gap-1.5">
                      <Input
                        type={showToken ? 'text' : 'password'}
                        placeholder={f.placeholder}
                        value={tokens[f.key] ?? ''}
                        onChange={(e) => setTokens((v) => ({ ...v, [f.key]: e.target.value }))}
                        className="font-mono text-xs"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="shrink-0"
                        onClick={() => setShowToken((v) => !v)}
                      >
                        {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-1">
                  <Button variant="outline" size="sm" onClick={() => setStep('choose')}>
                    Back
                  </Button>
                  <Button
                    size="sm"
                    disabled={saving || !current.meta.tokenFields?.some((f) => tokens[f.key]?.trim())}
                    onClick={() => void handleSaveToken()}
                  >
                    {saving ? 'Saving…' : 'Save & Connect'}
                  </Button>
                </div>
              </div>
            )}

            {current.meta.setupType === 'qr' && (
              <div className="space-y-3">
                <QrLoginDialog
                  label={current.label}
                  client={client}
                  onRefresh={() => {
                    onRefresh()
                    setStep('done')
                  }}
                />
                <div className="flex justify-start">
                  <Button variant="outline" size="sm" onClick={() => setStep('choose')}>
                    Back
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Done */}
        {step === 'done' && current && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-success">
              <Check className="h-4 w-4" />
              <span className="text-sm font-medium">{current.label} configured</span>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium">Next steps:</p>
              <ol className="list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
                {current.meta.postSetup.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </div>
            <div className="flex items-center justify-between">
              <Button variant="outline" size="sm" onClick={reset}>
                Setup Another
              </Button>
              <Button size="sm" onClick={() => handleOpenChange(false)}>
                Done
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
