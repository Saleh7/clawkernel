import { Brain, Eye, Search, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import type { ModelCatalogEntry } from '@/lib/gateway/types'

type Props = {
  models: ModelCatalogEntry[]
}

function formatContextWindow(n: number | undefined): string {
  if (!n) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

function providerBadgeColor(provider: string): string {
  const p = provider.toLowerCase()
  if (p.includes('anthropic')) return 'text-orange-600 dark:text-orange-400 border-orange-500/30'
  if (p.includes('openai') || p.includes('codex')) return 'text-green-600 dark:text-green-400 border-green-500/30'
  if (p.includes('google')) return 'text-blue-600 dark:text-blue-400 border-blue-500/30'
  if (p.includes('ollama')) return 'text-purple-600 dark:text-purple-400 border-purple-500/30'
  if (p.includes('bedrock')) return 'text-amber-600 dark:text-amber-400 border-amber-500/30'
  return 'text-muted-foreground border-border'
}

function ModelRow({ model }: { model: ModelCatalogEntry }) {
  const hasImage = model.input?.includes('image') ?? false
  return (
    <tr className="hover:bg-muted/10 transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-foreground font-mono">{model.name}</span>
          {model.reasoning && (
            <span title="Reasoning model">
              <Brain className="h-3 w-3 text-primary/70" />
            </span>
          )}
          {hasImage && (
            <span title="Vision / image input">
              <Eye className="h-3 w-3 text-sky-500/70" />
            </span>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground/50 font-mono mt-0.5">{model.id}</p>
      </td>
      <td className="px-4 py-3">
        <Badge variant="outline" className={`text-[10px] ${providerBadgeColor(model.provider)}`}>
          {model.provider}
        </Badge>
      </td>
      <td className="px-4 py-3 text-right">
        <span className="text-[11px] font-mono text-muted-foreground">{formatContextWindow(model.contextWindow)}</span>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {model.reasoning && (
            <Badge variant="secondary" className="text-[8px] gap-0.5">
              <Brain className="h-2 w-2" />
              reasoning
            </Badge>
          )}
          {hasImage && (
            <Badge variant="secondary" className="text-[8px] gap-0.5">
              <Eye className="h-2 w-2" />
              vision
            </Badge>
          )}
        </div>
      </td>
    </tr>
  )
}

export function ModelsList({ models }: Props) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return models
    return models.filter(
      (m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q) || m.provider.toLowerCase().includes(q),
    )
  }, [models, search])

  const byProvider = useMemo(() => {
    const map = new Map<string, ModelCatalogEntry[]>()
    for (const m of filtered) {
      const list = map.get(m.provider) ?? []
      list.push(m)
      map.set(m.provider, list)
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [filtered])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Available Models
          <span className="ml-2 text-[10px] normal-case font-normal text-muted-foreground/50">
            {models.length} total
            {search && ` · ${filtered.length} matching`}
          </span>
        </p>
        <div className="relative w-56">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40" />
          <Input
            placeholder="Filter models…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-8 text-xs bg-card/80"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border/40 py-10 gap-2">
          <Sparkles className="h-6 w-6 text-muted-foreground/20" />
          <p className="text-xs text-muted-foreground/50">No models match your search</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border/40 overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/40 bg-muted/20">
                <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground/70 uppercase tracking-wider text-[10px]">
                  Model
                </th>
                <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground/70 uppercase tracking-wider text-[10px]">
                  Provider
                </th>
                <th className="px-4 py-2.5 text-right font-semibold text-muted-foreground/70 uppercase tracking-wider text-[10px]">
                  Context
                </th>
                <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground/70 uppercase tracking-wider text-[10px]">
                  Capabilities
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {byProvider.map(([, providerModels]) =>
                providerModels.map((model) => <ModelRow key={`${model.provider}/${model.id}`} model={model} />),
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
