import { AlertTriangle, ExternalLink, RefreshCw, Search } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ModelSelector } from './components/model-selector'
import { ProviderCards } from './components/provider-cards'
import { SearchPlayground } from './components/search-playground'
import { keysConfigured, SearchStatusBar } from './components/search-status-bar'
import { useSearchConfig } from './hooks/use-search-config'
import { useSearchPlayground } from './hooks/use-search-playground'
import { PROVIDER_LIST } from './types'

export default function SearchPage() {
  const { webSearch, loading, loadError, saving, refresh, handleSaveModel } = useSearchConfig()
  const { state: playgroundState, runSearch, reset: resetPlayground } = useSearchPlayground()

  const anyKey = webSearch ? keysConfigured(webSearch) > 0 : false
  const activeProvider = webSearch?.provider ?? 'brave'

  let content: React.ReactNode | null = null
  if (loading && !webSearch) {
    content = (
      <div className="flex flex-col gap-4">
        {Array.from({ length: 3 }, (_unused, n) => `search-skeleton-${n + 1}`).map((id) => (
          <div key={id} className="h-28 animate-pulse rounded-xl bg-muted/30" />
        ))}
      </div>
    )
  } else if (loadError && !webSearch) {
    content = (
      <div className="flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/5 p-4">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
        <div>
          <p className="text-xs font-semibold text-red-300">Failed to load search configuration</p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{loadError}</p>
        </div>
      </div>
    )
  } else if (webSearch) {
    content = (
      <>
        {/* 6.1 — Provider Status Bar */}
        <SearchStatusBar cfg={webSearch} />

        {/* No provider warning */}
        {!anyKey && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
            <div>
              <p className="text-xs font-semibold text-amber-300">No search provider configured</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Set at least one API key in your <code className="text-xs">openclaw.json</code> config (
                {PROVIDER_LIST.join(', ')}) or via environment variable.
              </p>
              <a
                href="https://docs.openclaw.ai/tools/web#setting-up-perplexity-search"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-xs text-cyan-400 hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                Setup guide
              </a>
            </div>
          </div>
        )}

        {/* 6.2 — Provider Cards */}
        <ProviderCards cfg={webSearch} />

        {/* 6.4 — Model Selector (shown when active provider supports model config) */}
        <ModelSelector cfg={webSearch} saving={saving} onSave={handleSaveModel} />

        {/* 6.3 — Search Playground */}
        <SearchPlayground
          playgroundState={playgroundState}
          onRun={runSearch}
          onReset={resetPlayground}
          disabled={!anyKey}
          activeProvider={activeProvider}
        />

        {/* Docs link */}
        <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
          <h3 className="text-xs font-semibold text-foreground/80">Documentation</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Full setup instructions, supported providers, query parameters (country, language, freshness), and
            configuration reference:
          </p>
          <a
            href="https://docs.openclaw.ai/tools/web#setting-up-perplexity-search"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-border/40 bg-muted/20 px-3 py-2 text-xs font-medium text-cyan-400 transition-colors hover:bg-muted/40"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            OpenClaw Web Search Docs
          </a>
        </div>
      </>
    )
  }

  return (
    <div className="flex flex-col gap-8 p-6">
      <PageHeader
        icon={Search}
        title="Web Search"
        description="Configure providers, select models, and run test searches through connected agents"
      >
        <Button size="sm" variant="outline" onClick={() => void refresh()} disabled={loading} className="gap-1.5">
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          Refresh
        </Button>
      </PageHeader>

      {content}
    </div>
  )
}
