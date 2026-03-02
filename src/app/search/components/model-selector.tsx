import { CheckCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { WebSearchConfig, WebSearchProvider } from '../types'

// Perplexity has well-known preset models; others use a free-form text input.
const PERPLEXITY_PRESETS = [
  { id: 'perplexity/sonar', label: 'Sonar', description: 'Quick Q&A lookups' },
  { id: 'perplexity/sonar-pro', label: 'Sonar Pro', description: 'Complex multi-step (default)' },
  { id: 'perplexity/sonar-reasoning-pro', label: 'Sonar Reasoning Pro', description: 'Deep chain-of-thought' },
] as const

const TEXT_INPUT_PROVIDERS: Partial<Record<WebSearchProvider, { placeholder: string }>> = {
  grok: { placeholder: 'grok-4-1-fast' },
  gemini: { placeholder: 'gemini-2.5-flash' },
  kimi: { placeholder: 'moonshot-v1-128k' },
}

function currentModel(provider: WebSearchProvider, cfg: WebSearchConfig): string {
  if (provider === 'perplexity') return cfg.perplexity?.model ?? ''
  if (provider === 'grok') return cfg.grok?.model ?? ''
  if (provider === 'gemini') return cfg.gemini?.model ?? ''
  if (provider === 'kimi') return cfg.kimi?.model ?? ''
  return ''
}

export function ModelSelector({
  cfg,
  saving,
  onSave,
}: {
  cfg: WebSearchConfig
  saving: boolean
  onSave: (provider: string, model: string) => void
}) {
  const provider = cfg.provider ?? 'brave'
  const model = currentModel(provider, cfg)
  const [inputValue, setInputValue] = useState(model)

  // F3 — re-sync when config is refreshed externally
  useEffect(() => {
    setInputValue(model)
  }, [model])

  // Brave has no model field
  if (provider === 'brave') return null

  // Perplexity — preset buttons
  if (provider === 'perplexity') {
    const active = model || 'perplexity/sonar-pro'
    return (
      <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-3">
        <div>
          <h3 className="text-xs font-semibold text-foreground/80">Perplexity Model</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Currently using <code className="rounded bg-muted px-1 text-foreground/70">{active}</code>
          </p>
        </div>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
          {PERPLEXITY_PRESETS.map((m) => {
            const isSelected = active === m.id
            return (
              <button
                key={m.id}
                type="button"
                disabled={saving || isSelected}
                onClick={() => onSave(provider, m.id)}
                className={cn(
                  'rounded-lg border px-2.5 py-2 text-left transition-colors',
                  isSelected
                    ? 'border-violet-500/30 bg-violet-500/10 cursor-default'
                    : 'border-border/40 bg-muted/10 hover:border-violet-500/20 hover:bg-violet-500/5 cursor-pointer disabled:opacity-50',
                )}
              >
                <div className="flex items-center gap-1.5">
                  <p className={cn('text-xs font-medium', isSelected ? 'text-violet-300' : 'text-foreground/70')}>
                    {m.label}
                  </p>
                  {isSelected && <CheckCircle className="h-3 w-3 text-violet-400" />}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{m.description}</p>
                <code className="mt-1 block text-xs text-muted-foreground/60">{m.id}</code>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // Grok / Gemini / Kimi — free-form text input
  const inputMeta = TEXT_INPUT_PROVIDERS[provider]
  if (!inputMeta) return null

  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-3">
      <h3 className="text-xs font-semibold text-foreground/80">Model Override</h3>
      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1">
          <Label htmlFor="model-input" className="text-xs font-medium text-muted-foreground">
            Model ID
          </Label>
          <Input
            id="model-input"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={inputMeta.placeholder}
            className="h-8 text-xs font-mono"
          />
        </div>
        <Button
          size="sm"
          disabled={saving || !inputValue.trim() || inputValue.trim() === model}
          onClick={() => onSave(provider, inputValue.trim())}
        >
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground/60">
        Leave empty to use the provider default ({inputMeta.placeholder}).
      </p>
    </div>
  )
}
