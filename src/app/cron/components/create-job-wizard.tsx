import { Calendar, Check } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { cronToHuman, formatSchedule } from '@/lib/cron'
import type { GatewayClient } from '@/lib/gateway/client'
import { createLogger } from '@/lib/logger'
import { cn } from '@/lib/utils'
import { useGatewayStore } from '@/stores/gateway-store'
import {
  type CronFormState,
  DEFAULT_FORM,
  formToDelivery,
  formToPayload,
  formToSchedule,
  SCHEDULE_PRESETS,
  validateForm,
} from '../types'

const log = createLogger('cron:wizard')
const TOTAL_STEPS = 5

function stepMarkerClass(step: number, markerStep: number): string {
  if (markerStep === step) return 'w-4 bg-primary'
  if (markerStep < step) return 'w-1.5 bg-primary/60'
  return 'w-1.5 bg-muted'
}

function scheduleKindLabel(kind: 'cron' | 'every' | 'at'): string {
  if (kind === 'cron') return 'Cron'
  if (kind === 'every') return 'Interval'
  return 'One-shot'
}

type Props = {
  readonly open: boolean
  readonly onOpenChange: (v: boolean) => void
  readonly client: GatewayClient | null
  readonly is24h: boolean
  readonly onCreated: () => void
}

export function CreateJobWizard({ open, onOpenChange, client, is24h, onCreated }: Props) {
  const [step, setStep] = useState(1)
  const [form, setForm] = useState<CronFormState>({ ...DEFAULT_FORM })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const agentsResult = useGatewayStore((s) => s.agents)
  const agentList = useMemo(() => agentsResult?.agents ?? [], [agentsResult])

  useEffect(() => {
    if (open) {
      setStep(1)
      setForm({ ...DEFAULT_FORM })
      setError(null)
    }
  }, [open])

  const update = <K extends keyof CronFormState>(key: K, val: CronFormState[K]) =>
    setForm((f) => ({ ...f, [key]: val }))

  const canAdvance = (): boolean => {
    switch (step) {
      case 1:
        return form.name.trim().length > 0
      case 2:
        if (form.scheduleKind === 'cron') return form.cronExpr.trim().length > 0
        if (form.scheduleKind === 'every') return form.everyMs > 0
        if (form.scheduleKind === 'at') return form.atDatetime.length > 0
        return false
      case 3:
        return form.payloadText.trim().length > 0
      case 4:
        return true
      default:
        return true
    }
  }

  const handleSubmit = async () => {
    const err = validateForm(form)
    if (err) {
      setError(err)
      return
    }
    if (!client) return
    setBusy(true)
    setError(null)
    try {
      await client.request('cron.add', {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        agentId: form.agentId || undefined,
        enabled: form.enabled,
        deleteAfterRun: form.deleteAfterRun,
        schedule: formToSchedule(form),
        sessionTarget: form.sessionTarget,
        wakeMode: form.wakeMode,
        payload: formToPayload(form),
        delivery: formToDelivery(form),
      })
      toast.success('Cron job created')
      onCreated()
      onOpenChange(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create job'
      setError(msg)
      log.warn('cron.add failed', err)
    }
    setBusy(false)
  }

  const schedulePreviewLabel = useMemo(() => {
    try {
      const s = formToSchedule(form)
      return formatSchedule(s, is24h).label
    } catch {
      return '—'
    }
  }, [form, is24h])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            New Cron Job
          </DialogTitle>
          <DialogDescription className="flex items-center justify-between">
            <span>{stepLabel(step)}</span>
            <span className="flex items-center gap-1.5">
              {Array.from({ length: TOTAL_STEPS }, (_, i) => (
                <div key={i} className={cn('h-1.5 rounded-full transition-all', stepMarkerClass(step, i + 1))} />
              ))}
              <span className="ml-1 text-xs text-muted-foreground/60">
                {step}/{TOTAL_STEPS}
              </span>
            </span>
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-4 pb-2">
            {/* Step 1: Basics */}
            {step === 1 && (
              <>
                <div className="space-y-1.5">
                  <Label>Name *</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => update('name', e.target.value)}
                    placeholder="e.g. Morning Brief, Weekly Report"
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>
                    Description <span className="text-muted-foreground/60">(optional)</span>
                  </Label>
                  <Input
                    value={form.description}
                    onChange={(e) => update('description', e.target.value)}
                    placeholder="Brief description"
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Agent</Label>
                  <select
                    value={form.agentId}
                    onChange={(e) => update('agentId', e.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">Default (main)</option>
                    {agentList.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name || a.id}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {/* Step 2: Schedule */}
            {step === 2 && (
              <>
                <div className="grid grid-cols-2 gap-2 max-h-52 overflow-y-auto pr-1">
                  {SCHEDULE_PRESETS.map((preset) => {
                    const selected = form.presetId === preset.id
                    let label = preset.label
                    if (preset.kind === 'cron' && 'expr' in preset) {
                      const human = cronToHuman(preset.expr, is24h)
                      if (human !== preset.expr) label = human
                    }
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          update('presetId', preset.id)
                          if (preset.kind === 'cron' && 'expr' in preset) {
                            update('scheduleKind', 'cron')
                            update('cronExpr', preset.expr)
                          } else if (preset.kind === 'every' && 'everyMs' in preset) {
                            update('scheduleKind', 'every')
                            update('everyMs', preset.everyMs)
                          } else if (preset.kind === 'at') {
                            update('scheduleKind', 'at')
                          }
                        }}
                        className={cn(
                          'rounded-lg border px-3 py-2.5 text-left text-xs transition-colors',
                          selected
                            ? 'border-primary/40 bg-primary/10 text-foreground'
                            : 'border-border/30 bg-muted/50 text-muted-foreground hover:bg-muted/80',
                        )}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>

                {form.presetId === 'at' && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Run at</Label>
                    <Input
                      type="datetime-local"
                      value={form.atDatetime}
                      onChange={(e) => update('atDatetime', e.target.value)}
                      className="text-xs"
                    />
                  </div>
                )}

                {form.presetId === 'custom' && (
                  <div className="space-y-3 rounded-lg border border-border/30 bg-muted/30 p-3">
                    <div className="flex gap-2">
                      {(['cron', 'every', 'at'] as const).map((k) => (
                        <Button
                          key={k}
                          size="sm"
                          variant={form.scheduleKind === k ? 'default' : 'outline'}
                          className="text-xs"
                          onClick={() => update('scheduleKind', k)}
                        >
                          {scheduleKindLabel(k)}
                        </Button>
                      ))}
                    </div>
                    {form.scheduleKind === 'cron' && (
                      <Input
                        className="font-mono text-xs"
                        value={form.cronExpr}
                        onChange={(e) => update('cronExpr', e.target.value)}
                        placeholder="0 8 * * *"
                      />
                    )}
                    {form.scheduleKind === 'every' && (
                      <Input
                        className="font-mono text-xs"
                        type="number"
                        value={form.everyMs / 60_000}
                        onChange={(e) => update('everyMs', Number(e.target.value) * 60_000)}
                        placeholder="Minutes"
                      />
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
                )}

                <div className="space-y-1.5">
                  <Label className="text-xs">Timezone</Label>
                  <Input
                    value={form.cronTz}
                    onChange={(e) => update('cronTz', e.target.value)}
                    placeholder={Intl.DateTimeFormat().resolvedOptions().timeZone}
                    className="text-xs"
                  />
                </div>
              </>
            )}

            {/* Step 3: Payload */}
            {step === 3 && (
              <>
                <div className="flex gap-2">
                  {(['agentTurn', 'systemEvent'] as const).map((k) => (
                    <Button
                      key={k}
                      size="sm"
                      variant={form.payloadKind === k ? 'default' : 'outline'}
                      onClick={() => {
                        update('payloadKind', k)
                        if (k === 'systemEvent') {
                          update('sessionTarget', 'main')
                          update('deliveryMode', 'none')
                        }
                      }}
                    >
                      {k === 'agentTurn' ? 'Agent Turn' : 'System Event'}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground/70">
                  {form.payloadKind === 'agentTurn'
                    ? 'Runs in an isolated session — best for tasks with delivery'
                    : 'Runs in the main session — best for internal updates'}
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Session</Label>
                    <select
                      value={form.sessionTarget}
                      onChange={(e) => update('sessionTarget', e.target.value as 'main' | 'isolated')}
                      disabled={form.payloadKind === 'systemEvent'}
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs disabled:opacity-50"
                    >
                      <option value="isolated">Isolated</option>
                      <option value="main">Main</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Wake Mode</Label>
                    <select
                      value={form.wakeMode}
                      onChange={(e) => update('wakeMode', e.target.value as 'now' | 'next-heartbeat')}
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
                    >
                      <option value="now">Now</option>
                      <option value="next-heartbeat">Next Heartbeat</option>
                    </select>
                  </div>
                </div>

                <Separator />

                <div className="space-y-1.5">
                  <Label>{form.payloadKind === 'agentTurn' ? 'Agent Prompt *' : 'System Event Text *'}</Label>
                  <Textarea
                    className="min-h-[100px] resize-y text-xs"
                    value={form.payloadText}
                    onChange={(e) => update('payloadText', e.target.value)}
                    placeholder={
                      form.payloadKind === 'agentTurn'
                        ? 'e.g. Summarize the latest news and send a brief update…'
                        : 'e.g. Time to run the daily health check.'
                    }
                    autoFocus
                  />
                </div>

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
              </>
            )}

            {/* Step 4: Delivery */}
            {step === 4 && (
              <>
                <p className="text-xs text-muted-foreground/70">
                  {form.sessionTarget === 'isolated'
                    ? 'Isolated jobs can announce results to a messaging channel.'
                    : "Main session jobs usually don't need delivery."}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Mode</Label>
                    <select
                      value={form.deliveryMode}
                      onChange={(e) => update('deliveryMode', e.target.value as CronFormState['deliveryMode'])}
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
                    >
                      <option value="announce">Announce (send summary)</option>
                      <option value="none">No delivery</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Channel</Label>
                    <Input
                      value={form.deliveryChannel}
                      onChange={(e) => update('deliveryChannel', e.target.value)}
                      placeholder="last"
                      disabled={form.deliveryMode === 'none'}
                      className="text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Recipient</Label>
                    <Input
                      value={form.deliveryTo}
                      onChange={(e) => update('deliveryTo', e.target.value)}
                      placeholder="telegram:CHAT_ID"
                      disabled={form.deliveryMode === 'none'}
                      className="font-mono text-xs"
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
                    <span>Best effort delivery</span>
                  </label>
                )}
                {form.deliveryMode === 'announce' && !form.deliveryTo && (
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    No recipient set. Delivery may fail unless a default target exists.
                  </p>
                )}
              </>
            )}

            {/* Step 5: Review */}
            {step === 5 && (
              <>
                <div className="rounded-lg border border-border/20 bg-muted/40 divide-y divide-border/10">
                  <ReviewRow label="Name" value={form.name} />
                  <ReviewRow label="Agent" value={form.agentId || 'main'} />
                  <ReviewRow label="Schedule" value={schedulePreviewLabel} />
                  <ReviewRow label="Session" value={`${form.sessionTarget} · ${form.wakeMode}`} />
                  <ReviewRow
                    label="Payload"
                    value={`${form.payloadKind} · ${form.payloadText.slice(0, 80)}${form.payloadText.length > 80 ? '…' : ''}`}
                  />
                  {form.payloadModel && <ReviewRow label="Model" value={form.payloadModel} mono />}
                  <ReviewRow
                    label="Delivery"
                    value={
                      form.deliveryMode === 'none'
                        ? 'No delivery'
                        : `${form.deliveryChannel || 'auto'} → ${form.deliveryTo || '(not set)'}`
                    }
                  />
                  <ReviewRow label="Enabled" value={form.enabled ? 'Yes' : 'No'} />
                  {form.deleteAfterRun && <ReviewRow label="Delete after run" value="Yes" />}
                </div>
                {error && <p className="text-xs text-destructive">{error}</p>}
              </>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2">
          {step > 1 && (
            <Button variant="ghost" onClick={() => setStep(step - 1)} className="mr-auto">
              ← Back
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {step < TOTAL_STEPS ? (
            <Button onClick={() => setStep(step + 1)} disabled={!canAdvance()}>
              Next →
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={busy} className="gap-1">
              <Check className="h-3.5 w-3.5" />
              {busy ? 'Creating…' : 'Create Job'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function stepLabel(step: number): string {
  switch (step) {
    case 1:
      return 'Name your job and pick an agent'
    case 2:
      return 'Choose a schedule'
    case 3:
      return 'Define the payload'
    case 4:
      return 'Configure delivery'
    case 5:
      return 'Review & create'
    default:
      return ''
  }
}

function ReviewRow({
  label,
  value,
  mono,
}: {
  readonly label: string
  readonly value: string
  readonly mono?: boolean
}) {
  return (
    <div className="flex items-center justify-between px-3 py-2.5">
      <span className="text-xs text-muted-foreground/80">{label}</span>
      <span className={cn('text-xs text-right max-w-[60%] truncate', mono && 'font-mono')}>{value}</span>
    </div>
  )
}
