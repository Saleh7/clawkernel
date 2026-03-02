import { Check, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cronToHuman } from '@/lib/cron'
import type { GatewayClient } from '@/lib/gateway/client'
import type { CronJob } from '@/lib/gateway/types'
import { createLogger } from '@/lib/logger'
import { cn } from '@/lib/utils'
import { type CronFormState, formToDelivery, formToPayload, formToSchedule, jobToForm, validateForm } from '../types'

const log = createLogger('cron:edit')

type Props = {
  job: CronJob
  client: GatewayClient | null
  is24h: boolean
  onClose: () => void
  onSaved: () => void
}

export function JobEditForm({ job, client, is24h, onClose, onSaved }: Props) {
  const [form, setForm] = useState<CronFormState>(() => jobToForm(job))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setForm(jobToForm(job))
    setError(null)
  }, [job])

  const update = <K extends keyof CronFormState>(key: K, val: CronFormState[K]) =>
    setForm((f) => ({ ...f, [key]: val }))

  const handleSave = async () => {
    const err = validateForm(form)
    if (err) {
      setError(err)
      return
    }
    if (!client) return
    setBusy(true)
    setError(null)
    try {
      await client.request('cron.update', {
        id: job.id,
        patch: {
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          enabled: form.enabled,
          deleteAfterRun: form.deleteAfterRun,
          schedule: formToSchedule(form),
          sessionTarget: form.sessionTarget,
          wakeMode: form.wakeMode,
          payload: formToPayload(form),
          delivery: formToDelivery(form),
        },
      })
      toast.success('Job updated')
      onSaved()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update'
      setError(msg)
      log.warn('cron.update failed', err)
    }
    setBusy(false)
  }

  const scheduleHint =
    form.scheduleKind === 'cron' && form.cronExpr.trim() ? cronToHuman(form.cronExpr.trim(), is24h) : undefined

  return (
    <div className="border-t border-border/20 bg-card/70 px-4 py-4 space-y-4">
      {/* Name + Description */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Name</Label>
          <Input value={form.name} onChange={(e) => update('name', e.target.value)} className="text-sm" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Description</Label>
          <Input
            value={form.description}
            onChange={(e) => update('description', e.target.value)}
            placeholder="Optional"
            className="text-xs"
          />
        </div>
      </div>

      {/* Schedule */}
      <div className="space-y-2">
        <Label className="text-xs">Schedule</Label>
        <div className="flex gap-2">
          {(['cron', 'every', 'at'] as const).map((k) => (
            <Button
              key={k}
              size="sm"
              variant={form.scheduleKind === k ? 'default' : 'outline'}
              className="text-xs"
              onClick={() => update('scheduleKind', k)}
            >
              {k === 'cron' ? 'Cron' : k === 'every' ? 'Interval' : 'One-shot'}
            </Button>
          ))}
        </div>
        {form.scheduleKind === 'cron' && (
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[10px]">Expression</Label>
              <Input
                className="font-mono text-xs"
                value={form.cronExpr}
                onChange={(e) => update('cronExpr', e.target.value)}
                placeholder="0 8 * * *"
              />
              {scheduleHint && scheduleHint !== form.cronExpr && (
                <p className="text-[10px] text-muted-foreground/60">{scheduleHint}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Timezone</Label>
              <Input
                className="text-xs"
                value={form.cronTz}
                onChange={(e) => update('cronTz', e.target.value)}
                placeholder={Intl.DateTimeFormat().resolvedOptions().timeZone}
              />
            </div>
          </div>
        )}
        {form.scheduleKind === 'every' && (
          <IntervalInput value={form.everyMs} onChange={(ms) => update('everyMs', ms)} />
        )}
        {form.scheduleKind === 'at' && (
          <Input
            type="datetime-local"
            value={form.atDatetime}
            onChange={(e) => update('atDatetime', e.target.value)}
            className="text-xs"
          />
        )}
      </div>

      {/* Payload */}
      <div className="space-y-2">
        <Label className="text-xs">Payload</Label>
        <div className="flex gap-2">
          {(['agentTurn', 'systemEvent'] as const).map((k) => (
            <Button
              key={k}
              size="sm"
              variant={form.payloadKind === k ? 'default' : 'outline'}
              className="text-xs"
              onClick={() => update('payloadKind', k)}
            >
              {k === 'agentTurn' ? 'Agent Turn' : 'System Event'}
            </Button>
          ))}
        </div>
        <Textarea
          className="min-h-[80px] resize-y text-xs"
          value={form.payloadText}
          onChange={(e) => update('payloadText', e.target.value)}
          placeholder={form.payloadKind === 'agentTurn' ? 'Agent message…' : 'Event text…'}
        />
        {form.payloadKind === 'agentTurn' && (
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label className="text-[10px]">Model override</Label>
              <Input
                className="font-mono text-xs"
                value={form.payloadModel}
                onChange={(e) => update('payloadModel', e.target.value)}
                placeholder="Default"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Thinking</Label>
              <select
                value={form.payloadThinking}
                onChange={(e) => update('payloadThinking', e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
              >
                <option value="">Default</option>
                <option value="off">Off</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Timeout (sec)</Label>
              <Input
                className="text-xs"
                type="number"
                value={form.timeoutSeconds}
                onChange={(e) => update('timeoutSeconds', e.target.value)}
                placeholder="—"
              />
            </div>
          </div>
        )}
      </div>

      {/* Delivery */}
      <div className="space-y-2">
        <Label className="text-xs">Delivery</Label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="space-y-1">
            <Label className="text-[10px]">Mode</Label>
            <select
              value={form.deliveryMode}
              onChange={(e) => update('deliveryMode', e.target.value as CronFormState['deliveryMode'])}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
            >
              <option value="announce">Announce</option>
              <option value="none">No delivery</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px]">Channel</Label>
            <Input
              className="text-xs"
              value={form.deliveryChannel}
              onChange={(e) => update('deliveryChannel', e.target.value)}
              placeholder="last"
              disabled={form.deliveryMode === 'none'}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px]">Recipient</Label>
            <Input
              className="font-mono text-xs"
              value={form.deliveryTo}
              onChange={(e) => update('deliveryTo', e.target.value)}
              placeholder="telegram:CHAT_ID"
              disabled={form.deliveryMode === 'none'}
            />
          </div>
        </div>
        {form.deliveryMode === 'announce' && (
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={form.deliveryBestEffort}
              onChange={(e) => update('deliveryBestEffort', e.target.checked)}
              className="rounded"
            />
            Best effort (don't fail the job if delivery fails)
          </label>
        )}
      </div>

      {/* Flags */}
      <div className="flex flex-wrap gap-6">
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => update('enabled', e.target.checked)}
            className="rounded"
          />
          Enabled
        </label>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={form.deleteAfterRun}
            onChange={(e) => update('deleteAfterRun', e.target.checked)}
            className="rounded"
          />
          Delete after run
        </label>
        <div className="flex gap-4">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Session:</span>
            {(['main', 'isolated'] as const).map((v) => (
              <button
                type="button"
                key={v}
                onClick={() => update('sessionTarget', v)}
                className={cn(
                  'px-2 py-0.5 rounded text-xs',
                  form.sessionTarget === v ? 'bg-primary text-primary-foreground' : 'bg-muted',
                )}
              >
                {v}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Wake:</span>
            {(['now', 'next-heartbeat'] as const).map((v) => (
              <button
                type="button"
                key={v}
                onClick={() => update('wakeMode', v)}
                className={cn(
                  'px-2 py-0.5 rounded text-xs',
                  form.wakeMode === v ? 'bg-primary text-primary-foreground' : 'bg-muted',
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <div className="flex-1" />
        <Button variant="ghost" size="sm" onClick={onClose} className="gap-1 text-xs">
          <X className="h-3 w-3" />
          Cancel
        </Button>
        <Button size="sm" onClick={handleSave} disabled={busy} className="gap-1 text-xs">
          <Check className="h-3 w-3" />
          {busy ? 'Saving…' : 'Save Changes'}
        </Button>
      </div>
    </div>
  )
}

// -- Interval input ---------------------------------------------------------

const INTERVAL_UNITS = [
  { label: 'sec', ms: 1_000 },
  { label: 'min', ms: 60_000 },
  { label: 'hr', ms: 3_600_000 },
] as const

function IntervalInput({ value, onChange }: { value: number; onChange: (ms: number) => void }) {
  const unit = [...INTERVAL_UNITS].reverse().find((u) => value >= u.ms && value % u.ms === 0) ?? INTERVAL_UNITS[1]
  const [unitMs, setUnitMs] = useState(unit.ms)
  const displayAmount = Math.round(value / unitMs)

  return (
    <div className="flex gap-2 items-center">
      <Input
        type="number"
        className="w-24 text-xs"
        min={1}
        value={displayAmount}
        onChange={(e) => onChange(Number(e.target.value) * unitMs)}
      />
      <div className="flex gap-1">
        {INTERVAL_UNITS.map((u) => (
          <Button
            key={u.label}
            size="sm"
            variant={unitMs === u.ms ? 'default' : 'outline'}
            className="text-xs"
            onClick={() => {
              setUnitMs(u.ms)
              onChange(displayAmount * u.ms)
            }}
          >
            {u.label}
          </Button>
        ))}
      </div>
    </div>
  )
}
