import { Check, Info, X } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import type { TtsStatus } from '../types'

const AUTO_MODE_LABELS: Record<string, string> = {
  off: 'Off',
  always: 'Always',
  inbound: 'Inbound',
  tagged: 'Tagged',
}

const AUTO_MODE_DESCS: Record<string, string> = {
  off: 'No automatic TTS',
  always: 'All replies spoken',
  inbound: 'Voice-reply to voice messages',
  tagged: 'Only /tts tagged messages',
}

type Props = {
  status: TtsStatus
  saving: boolean
  onToggle: (enabled: boolean) => void
}

export function AudioStatusCard({ status, saving, onToggle }: Props) {
  return (
    <div className="rounded-xl border bg-card p-5 space-y-5">
      {/* Enable toggle */}
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-0.5">
          <p className="text-sm font-semibold">Text-to-Speech</p>
          <p className="text-xs text-muted-foreground">
            {status.enabled ? 'TTS is active — replies will be spoken.' : 'TTS is disabled — replies are text only.'}
          </p>
        </div>
        <Switch checked={status.enabled} onCheckedChange={onToggle} disabled={saving} aria-label="Toggle TTS enabled" />
      </div>

      {/* Auto mode display */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Auto-TTS Mode</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(['off', 'always', 'inbound', 'tagged'] as const).map((mode) => (
            <div
              key={mode}
              className={cn(
                'rounded-lg border px-3 py-2.5',
                status.auto === mode ? 'border-primary/40 bg-primary/10' : 'border-border bg-muted/30 opacity-50',
              )}
            >
              <p className={cn('text-xs font-medium', status.auto === mode ? 'text-primary' : 'text-muted-foreground')}>
                {AUTO_MODE_LABELS[mode]}
              </p>
              <p className="text-xs text-muted-foreground/70 mt-0.5">{AUTO_MODE_DESCS[mode]}</p>
            </div>
          ))}
        </div>
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground/70">
          <Info className="h-3.5 w-3.5 shrink-0 mt-px" />
          Enable/Disable sets Always or Off. To use Inbound or Tagged, set{' '}
          <code className="rounded bg-muted px-1 py-px">config.messages.tts.auto</code> manually.
        </p>
      </div>

      {/* Fallback chain */}
      {status.fallbackProviders.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Provider Fallback Chain
          </p>
          <div className="flex items-center flex-wrap gap-2">
            <span className="rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              {status.provider}
            </span>
            {status.fallbackProviders.map((fp) => (
              <span key={fp} className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground/50">→</span>
                <span className="rounded-md border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {fp}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* API key status */}
      <div className="space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">API Keys</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {[
            { name: 'OpenAI', has: status.hasOpenAIKey },
            { name: 'ElevenLabs', has: status.hasElevenLabsKey },
            { name: 'Edge TTS', has: status.edgeEnabled },
          ].map((k) => (
            <div
              key={k.name}
              className={cn(
                'flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs',
                k.has
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                  : 'border-border bg-muted/30 text-muted-foreground/50',
              )}
            >
              {k.has ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
              {k.name}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
