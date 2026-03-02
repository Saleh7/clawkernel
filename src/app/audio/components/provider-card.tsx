import { ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { TtsProvider } from '../types'

const PROVIDER_COLORS: Record<string, string> = {
  openai: 'border-emerald-500/30 bg-emerald-500/10',
  elevenlabs: 'border-violet-500/30 bg-violet-500/10',
  edge: 'border-sky-500/30 bg-sky-500/10',
}

const PROVIDER_LABEL_COLORS: Record<string, string> = {
  openai: 'text-emerald-400',
  elevenlabs: 'text-violet-400',
  edge: 'text-sky-400',
}

const PROVIDER_ICONS: Record<string, string> = {
  openai: '🤖',
  elevenlabs: '🔊',
  edge: '🌐',
}

type Props = {
  provider: TtsProvider
  isActive: boolean
  saving: boolean
  onSetActive: () => void
}

export function ProviderCard({ provider, isActive, saving, onSetActive }: Props) {
  const [expanded, setExpanded] = useState(false)

  const icon = PROVIDER_ICONS[provider.id] ?? '🔈'
  const activeColor = PROVIDER_COLORS[provider.id] ?? 'border-border bg-muted/30'
  const labelColor = PROVIDER_LABEL_COLORS[provider.id] ?? 'text-muted-foreground'

  return (
    <div
      className={cn(
        'rounded-xl border transition-all',
        isActive ? activeColor : 'border-border bg-card hover:bg-accent/30',
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3.5">
        <span className="text-base shrink-0">{icon}</span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold">{provider.name}</span>
            {isActive && (
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wider',
                  activeColor,
                  labelColor,
                )}
              >
                Active
              </span>
            )}
            {!provider.configured && (
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-amber-400">
                No API Key
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
            {provider.models.length > 0 && (
              <span>
                {provider.models.length} model{provider.models.length !== 1 ? 's' : ''}
              </span>
            )}
            {provider.voices && provider.voices.length > 0 && (
              <span>
                {provider.voices.length} voice{provider.voices.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!isActive && provider.configured && (
            <Button variant="outline" size="sm" onClick={onSetActive} disabled={saving}>
              Set Active
            </Button>
          )}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label={expanded ? 'Collapse provider details' : 'Expand provider details'}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-border/50 px-4 py-3 space-y-3">
          {provider.models.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Models</p>
              <div className="flex flex-wrap gap-1.5">
                {provider.models.map((m) => (
                  <span
                    key={m}
                    className={cn(
                      'rounded-md border px-2 py-0.5 text-xs',
                      PROVIDER_COLORS[provider.id] ?? 'border-border bg-muted',
                      PROVIDER_LABEL_COLORS[provider.id] ?? 'text-muted-foreground',
                    )}
                  >
                    {m}
                  </span>
                ))}
              </div>
            </div>
          )}

          {provider.voices && provider.voices.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Voices</p>
              <div className="flex flex-wrap gap-1.5">
                {provider.voices.map((v) => (
                  <span
                    key={v}
                    className={cn(
                      'rounded-md border px-2 py-0.5 text-xs',
                      PROVIDER_COLORS[provider.id] ?? 'border-border bg-muted',
                      PROVIDER_LABEL_COLORS[provider.id] ?? 'text-muted-foreground',
                    )}
                  >
                    {v}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
