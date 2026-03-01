import { useEffect, useState } from 'react'
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
import type { GatewayClient } from '@/lib/gateway/client'
import type { CronJob } from '@/lib/gateway/types'
import { cn } from '@/lib/utils'
import {
  defaultFormState,
  formStateToPayload,
  formStateToSchedule,
  type JobFormState,
  jobToFormState,
  refreshCron,
} from '../cron-utils'

export function CreateEditJobDialog({
  open,
  onOpenChange,
  client,
  agentId,
  editJob,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  client: GatewayClient | null
  agentId: string
  editJob: CronJob | null
}) {
  const [form, setForm] = useState<JobFormState>(defaultFormState)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setForm(editJob ? jobToFormState(editJob) : defaultFormState)
      setError(null)
    }
  }, [open, editJob])

  const update = <K extends keyof JobFormState>(key: K, val: JobFormState[K]) => setForm((f) => ({ ...f, [key]: val }))

  const handleSubmit = async () => {
    if (!client || !form.name.trim()) {
      setError('Name is required')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const common = {
        name: form.name,
        description: form.description || undefined,
        enabled: form.enabled,
        deleteAfterRun: form.deleteAfterRun,
        schedule: formStateToSchedule(form),
        sessionTarget: form.sessionTarget,
        wakeMode: form.wakeMode,
        payload: formStateToPayload(form),
      }
      if (editJob) {
        await client.request('cron.update', { jobId: editJob.id, patch: common })
      } else {
        await client.request('cron.add', { ...common, agentId })
      }
      await refreshCron(client)
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    }
    setBusy(false)
  }

  const radioBtn = (checked: boolean) => (
    <div
      className={cn(
        'h-4 w-4 rounded-full border-2 flex items-center justify-center transition-colors',
        checked ? 'border-primary' : 'border-muted-foreground/30',
      )}
    >
      {checked && <div className="h-2 w-2 rounded-full bg-primary" />}
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{editJob ? 'Edit Cron Job' : 'Create Cron Job'}</DialogTitle>
          <DialogDescription>
            {editJob ? 'Update the job configuration.' : 'Schedule a new recurring task for this agent.'}
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-5 pb-2">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="My cron job" />
            </div>

            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input
                value={form.description}
                onChange={(e) => update('description', e.target.value)}
                placeholder="Optional description"
              />
            </div>

            <Separator />

            {/* Schedule */}
            <div className="space-y-3">
              <Label>Schedule</Label>
              <div className="flex gap-2">
                {(['cron', 'every', 'at'] as const).map((k) => (
                  <Button
                    key={k}
                    size="sm"
                    variant={form.scheduleKind === k ? 'default' : 'outline'}
                    onClick={() => update('scheduleKind', k)}
                  >
                    {k === 'cron' ? 'Cron Expression' : k === 'every' ? 'Interval' : 'One-shot'}
                  </Button>
                ))}
              </div>
              {form.scheduleKind === 'cron' && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Expression</Label>
                    <Input
                      className="font-mono text-xs"
                      value={form.cronExpr}
                      onChange={(e) => update('cronExpr', e.target.value)}
                      placeholder="0 * * * *"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Timezone</Label>
                    <Input
                      className="text-xs"
                      value={form.cronTz}
                      onChange={(e) => update('cronTz', e.target.value)}
                      placeholder="UTC"
                    />
                  </div>
                </div>
              )}
              {form.scheduleKind === 'every' && (
                <div className="flex gap-2">
                  <Input
                    className="w-24 text-xs"
                    type="number"
                    value={form.intervalValue}
                    onChange={(e) => update('intervalValue', e.target.value)}
                  />
                  <div className="flex gap-1">
                    {(['seconds', 'minutes', 'hours'] as const).map((u) => (
                      <Button
                        key={u}
                        size="sm"
                        variant={form.intervalUnit === u ? 'default' : 'outline'}
                        onClick={() => update('intervalUnit', u)}
                        className="text-xs"
                      >
                        {u}
                      </Button>
                    ))}
                  </div>
                </div>
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

            <Separator />

            {/* Session target */}
            <div className="space-y-2">
              <Label>Session Target</Label>
              <div className="flex gap-4">
                {(['main', 'isolated'] as const).map((v) => (
                  <button
                    type="button"
                    key={v}
                    className="flex items-center gap-2 text-sm"
                    onClick={() => update('sessionTarget', v)}
                  >
                    {radioBtn(form.sessionTarget === v)}
                    <span className="capitalize">{v}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Wake mode */}
            <div className="space-y-2">
              <Label>Wake Mode</Label>
              <div className="flex gap-4">
                {(['next-heartbeat', 'now'] as const).map((v) => (
                  <button
                    type="button"
                    key={v}
                    className="flex items-center gap-2 text-sm"
                    onClick={() => update('wakeMode', v)}
                  >
                    {radioBtn(form.wakeMode === v)}
                    <span>{v}</span>
                  </button>
                ))}
              </div>
            </div>

            <Separator />

            {/* Payload */}
            <div className="space-y-3">
              <Label>Payload</Label>
              <div className="flex gap-2">
                {(['systemEvent', 'agentTurn'] as const).map((k) => (
                  <Button
                    key={k}
                    size="sm"
                    variant={form.payloadKind === k ? 'default' : 'outline'}
                    onClick={() => update('payloadKind', k)}
                  >
                    {k === 'systemEvent' ? 'System Event' : 'Agent Turn'}
                  </Button>
                ))}
              </div>
              {form.payloadKind === 'systemEvent' && (
                <div className="space-y-1">
                  <Label className="text-xs">Event Text</Label>
                  <Textarea
                    className="min-h-[80px] resize-y text-xs"
                    value={form.systemEventText}
                    onChange={(e) => update('systemEventText', e.target.value)}
                    placeholder="Cron event text…"
                  />
                </div>
              )}
              {form.payloadKind === 'agentTurn' && (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Message</Label>
                    <Textarea
                      className="min-h-[80px] resize-y text-xs"
                      value={form.agentTurnMessage}
                      onChange={(e) => update('agentTurnMessage', e.target.value)}
                      placeholder="Message for agent…"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Thinking Level</Label>
                      <Input
                        className="text-xs"
                        value={form.agentTurnThinking}
                        onChange={(e) => update('agentTurnThinking', e.target.value)}
                        placeholder="Optional"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Timeout (seconds)</Label>
                      <Input
                        className="text-xs"
                        type="number"
                        value={form.agentTurnTimeout}
                        onChange={(e) => update('agentTurnTimeout', e.target.value)}
                        placeholder="Optional"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <Separator />

            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(e) => update('enabled', e.target.checked)}
                  className="rounded"
                />
                Enabled
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.deleteAfterRun}
                  onChange={(e) => update('deleteAfterRun', e.target.checked)}
                  className="rounded"
                />
                Delete after run
              </label>
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={busy}>
            {busy ? (editJob ? 'Saving…' : 'Creating…') : editJob ? 'Save Changes' : 'Create Job'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
