import { cn } from '@/lib/utils'
import type { WebSearchConfig, WebSearchProvider } from '../types'

const PROVIDER_LABELS: Record<WebSearchProvider, string> = {
  brave: 'Brave Search',
  perplexity: 'Perplexity',
  grok: 'Grok (xAI)',
  gemini: 'Gemini',
  kimi: 'Kimi (Moonshot)',
}

const DEFAULT_MODELS: Record<WebSearchProvider, string> = {
  brave: '—',
  perplexity: 'perplexity/sonar-pro',
  grok: 'grok-4-1-fast',
  gemini: 'gemini-2.5-flash',
  kimi: 'moonshot-v1-128k',
}

function activeModel(cfg: WebSearchConfig): string {
  const p = cfg.provider ?? 'brave'
  if (p === 'perplexity') return cfg.perplexity?.model ?? DEFAULT_MODELS.perplexity
  if (p === 'grok') return cfg.grok?.model ?? DEFAULT_MODELS.grok
  if (p === 'gemini') return cfg.gemini?.model ?? DEFAULT_MODELS.gemini
  if (p === 'kimi') return cfg.kimi?.model ?? DEFAULT_MODELS.kimi
  return '—'
}

export function keysConfigured(cfg: WebSearchConfig): number {
  let count = 0
  if (cfg.apiKey) count++ // brave (config-stored)
  if (cfg.perplexity?.apiKey) count++
  if (cfg.grok?.apiKey) count++
  if (cfg.gemini?.apiKey) count++
  if (cfg.kimi?.apiKey) count++
  return count
}

/** True only when the currently active provider has its key set in config. */
function isActiveProviderConfigured(cfg: WebSearchConfig): boolean {
  const p = cfg.provider ?? 'brave'
  if (p === 'brave') return Boolean(cfg.apiKey)
  return Boolean(cfg[p]?.apiKey)
}

type Tile = {
  label: string
  value: string
  accent?: boolean
}

function StatusTile({ label, value, accent }: Tile) {
  return (
    <div
      className={cn(
        'rounded-lg border px-3 py-2',
        accent ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-border/60 bg-muted/30',
      )}
    >
      <p
        className={cn(
          'truncate text-xs font-semibold leading-tight',
          accent ? 'text-emerald-400' : 'text-foreground/80',
        )}
      >
        {value}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

export function SearchStatusBar({ cfg }: { cfg: WebSearchConfig }) {
  const provider = cfg.provider ?? 'brave'
  const model = activeModel(cfg)
  const ttl = cfg.cacheTtlMinutes != null ? `${cfg.cacheTtlMinutes}m` : '—'
  const keys = keysConfigured(cfg)
  const activeConfigured = isActiveProviderConfigured(cfg)

  return (
    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
      <StatusTile label="Active provider" value={PROVIDER_LABELS[provider]} accent={activeConfigured} />
      <StatusTile label="Model" value={model} />
      <StatusTile label="Cache TTL" value={ttl} />
      <StatusTile label="Keys configured (config)" value={`${keys}/5`} accent={keys > 0} />
    </div>
  )
}
