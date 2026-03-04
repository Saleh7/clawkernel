import { CheckCircle, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { WebSearchConfig, WebSearchProvider } from '../types'
import { PROVIDER_LIST } from '../types'

type ProviderMeta = {
  label: string
  description: string
  envKey: string
  note?: string
}

const PROVIDER_META: Record<WebSearchProvider, ProviderMeta> = {
  brave: {
    label: 'Brave Search',
    description: 'Structured search results from the independent Brave index',
    envKey: 'BRAVE_API_KEY',
  },
  perplexity: {
    label: 'Perplexity',
    description: 'AI-synthesized answers with citations from real-time web search',
    envKey: 'PERPLEXITY_API_KEY',
    note: 'Also supports OpenRouter: set perplexity.baseUrl = https://openrouter.ai/api/v1',
  },
  grok: {
    label: 'Grok (xAI)',
    description: 'Live web search via xAI Grok with real-time internet access',
    envKey: 'XAI_API_KEY',
  },
  gemini: {
    label: 'Gemini',
    description: 'Google Gemini with grounded search and cited responses',
    envKey: 'GEMINI_API_KEY',
  },
  kimi: {
    label: 'Kimi (Moonshot)',
    description: 'Moonshot AI Kimi with long-context web understanding',
    envKey: 'KIMI_API_KEY / MOONSHOT_API_KEY',
  },
}

function isConfigured(provider: WebSearchProvider, cfg: WebSearchConfig): boolean {
  if (provider === 'brave') return Boolean(cfg.apiKey)
  return Boolean(cfg[provider]?.apiKey)
}

function providerCardClass(isActive: boolean, configured: boolean): string {
  if (isActive) return 'border-emerald-500/30 bg-emerald-500/5'
  if (configured) return 'border-border/60 bg-muted/20'
  return 'border-border/30 bg-muted/10 opacity-60'
}

function ProviderCard({
  provider,
  cfg,
  isActive,
}: {
  readonly provider: WebSearchProvider
  readonly cfg: WebSearchConfig
  readonly isActive: boolean
}) {
  const meta = PROVIDER_META[provider]
  const configured = isConfigured(provider, cfg)

  return (
    <div className={cn('rounded-xl border p-3.5 transition-colors', providerCardClass(isActive, configured))}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold text-foreground/90">{meta.label}</p>
            {isActive && (
              <span className="shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-emerald-400">
                Active
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{meta.description}</p>
        </div>
        {configured ? (
          <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
        ) : (
          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/40" />
        )}
      </div>

      <div className="mt-2.5 rounded-lg border border-border/40 bg-muted/20 px-2.5 py-2">
        <div className="flex items-center justify-between gap-2">
          <code className="text-xs font-medium text-muted-foreground">{meta.envKey}</code>
          {configured ? (
            <span className="text-xs text-emerald-400/80">Set in config</span>
          ) : (
            <span className="text-xs text-muted-foreground/60">Not set in config</span>
          )}
        </div>
        {!configured && (
          <p className="mt-1 text-xs text-muted-foreground/50">
            Set via <code className="text-xs">openclaw.json</code>, env block, or system environment
          </p>
        )}
        {meta.note && <p className="mt-1 text-xs text-muted-foreground/60">{meta.note}</p>}
      </div>
    </div>
  )
}

export function ProviderCards({ cfg }: { readonly cfg: WebSearchConfig }) {
  const activeProvider = cfg.provider ?? 'brave'

  return (
    <div>
      <h2 className="mb-2 text-xs font-semibold text-foreground/80">Search Providers</h2>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {PROVIDER_LIST.map((p) => (
          <ProviderCard key={p} provider={p} cfg={cfg} isActive={activeProvider === p} />
        ))}
      </div>
    </div>
  )
}
