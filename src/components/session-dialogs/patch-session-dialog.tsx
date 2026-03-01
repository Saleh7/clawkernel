import { Brain, Eye, Settings2, ShieldCheck, Sparkles, Timer } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import type { GatewayClient } from '@/lib/gateway/client'
import type { GatewaySessionRow, SessionsPatchResult } from '@/lib/gateway/types'
import { createLogger } from '@/lib/logger'
import { cn } from '@/lib/utils'
import { useSessionDialogClient } from './use-session-dialog-client'

const LEVELS = ['off', 'low', 'medium', 'high'] as const

const log = createLogger('sessions:patch-dialog')

interface LevelSelectorProps {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  onChange: (v: string) => void
}

function LevelSelector({ icon: Icon, label, value, onChange }: LevelSelectorProps) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5 text-xs">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        {label}
      </Label>
      <div className="flex gap-1">
        {LEVELS.map((level) => (
          <button
            type="button"
            key={level}
            onClick={() => onChange(level)}
            className={cn(
              'flex-1 rounded-lg border px-2 py-1.5 text-[11px] font-medium transition-all',
              value === level
                ? 'border-primary/50 bg-primary/10 text-primary'
                : 'border-border/50 bg-background/50 text-muted-foreground hover:border-border hover:text-foreground',
            )}
          >
            {level}
          </button>
        ))}
      </div>
    </div>
  )
}

interface PatchSessionDialogProps {
  session: GatewaySessionRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Optional — if omitted, falls back to the gateway store client */
  client?: GatewayClient | null
  /** Called after a successful patch */
  onPatched?: () => void
}

export function PatchSessionDialog({
  open,
  onOpenChange,
  session,
  client: clientProp,
  onPatched,
}: PatchSessionDialogProps) {
  const client = useSessionDialogClient(clientProp)

  const [thinking, setThinking] = useState(session?.thinkingLevel || 'off')
  const [reasoning, setReasoning] = useState(session?.reasoningLevel || 'off')
  const [verbose, setVerbose] = useState(session?.verboseLevel || 'off')
  const [elevated, setElevated] = useState(session?.elevatedLevel || 'off')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (session) {
      setThinking(session.thinkingLevel || 'off')
      setReasoning(session.reasoningLevel || 'off')
      setVerbose(session.verboseLevel || 'off')
      setElevated(session.elevatedLevel || 'off')
    }
  }, [session])

  const handleSave = async () => {
    if (!client?.connected || !session) return
    setSaving(true)
    try {
      await client.request<SessionsPatchResult>('sessions.patch', {
        key: session.key,
        thinkingLevel: thinking,
        reasoningLevel: reasoning,
        verboseLevel: verbose,
        elevatedLevel: elevated,
      })
      onPatched?.()
      onOpenChange(false)
    } catch (err) {
      log.warn('sessions.patch failed', err, { sessionKey: session.key })
      toast.error('Failed to patch session settings')
    }
    setSaving(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Settings2 className="h-4 w-4 text-primary" />
            Session Settings
          </DialogTitle>
          <DialogDescription className="font-mono text-xs text-muted-foreground truncate">
            {session?.key}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <LevelSelector icon={Brain} label="Thinking Level" value={thinking} onChange={setThinking} />
          <LevelSelector icon={Sparkles} label="Reasoning Level" value={reasoning} onChange={setReasoning} />
          <LevelSelector icon={Eye} label="Verbose Level" value={verbose} onChange={setVerbose} />
          <LevelSelector icon={ShieldCheck} label="Elevated Level" value={elevated} onChange={setElevated} />
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" disabled={saving} onClick={() => void handleSave()} className="gap-1.5">
            {saving ? <Timer className="h-3.5 w-3.5 animate-spin" /> : <Settings2 className="h-3.5 w-3.5" />}
            {saving ? 'Saving...' : 'Apply'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
