import { ChevronDown, Loader2, Plus, Tag, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { ModelCatalogEntry } from '@/lib/gateway/types'
import { cn } from '@/lib/utils'

type AliasEntry = { modelId: string; alias: string }

type Props = {
  readonly aliases: AliasEntry[]
  readonly models: ModelCatalogEntry[]
  readonly saving: boolean
  readonly onAddAlias: (modelId: string, alias: string) => Promise<void>
  readonly onRemoveAlias: (modelId: string) => Promise<void>
}

export function AliasesSection({ aliases, models, saving, onAddAlias, onRemoveAlias }: Props) {
  const [addModelId, setAddModelId] = useState('')
  const [addAliasName, setAddAliasName] = useState('')

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingRemove, setPendingRemove] = useState<AliasEntry | null>(null)
  const [removeLoading, setRemoveLoading] = useState(false)

  // Support both bare IDs (legacy) and provider/model-id format (current)
  const cataloguedIds = new Set(aliases.map((a) => a.modelId))

  const availableModels = models.filter((m) => !cataloguedIds.has(m.id) && !cataloguedIds.has(`${m.provider}/${m.id}`))
  const byProvider = availableModels.reduce<Record<string, ModelCatalogEntry[]>>((acc, m) => {
    const p = m.provider || 'other'
    ;(acc[p] ??= []).push(m)
    return acc
  }, {})

  const handleAdd = async () => {
    const trimmedModelId = addModelId.trim()
    if (!trimmedModelId) return
    await onAddAlias(trimmedModelId, addAliasName.trim())
    setAddAliasName('')
    setAddModelId('')
  }

  const handleConfirmRemove = async () => {
    if (!pendingRemove) return
    setRemoveLoading(true)
    try {
      await onRemoveAlias(pendingRemove.modelId)
    } finally {
      setRemoveLoading(false)
      setConfirmOpen(false)
      setPendingRemove(null)
    }
  }

  const isAllowlistActive = aliases.length > 0

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Model Catalog</p>
        {isAllowlistActive ? (
          <Badge variant="secondary" className="text-[10px] gap-1">
            {aliases.length} {aliases.length === 1 ? 'entry' : 'entries'} · allowlist active
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] text-muted-foreground/60">
            all models allowed
          </Badge>
        )}
      </div>
      <p className="text-xs text-muted-foreground/60">
        When entries exist, only listed models are allowed — empty = all models allowed
      </p>

      {/* Catalog table or empty state */}
      {aliases.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border/40 py-8 gap-2">
          <Tag className="h-5 w-5 text-muted-foreground/20" />
          <p className="text-xs text-muted-foreground/50">No models in catalog — all models allowed</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border/40 overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/40 bg-muted/20">
                <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground/70 uppercase tracking-wider text-[10px]">
                  Model ID
                </th>
                <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground/70 uppercase tracking-wider text-[10px]">
                  Alias
                </th>
                <th className="px-4 py-2.5 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {aliases.map(({ alias, modelId }) => (
                <tr key={modelId} className="hover:bg-muted/10 transition-colors">
                  <td className="px-4 py-2.5">
                    <code className="font-mono text-[11px] text-foreground">{modelId}</code>
                  </td>
                  <td className="px-4 py-2.5">
                    {alias ? (
                      <code className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-mono text-primary">
                        {alias}
                      </code>
                    ) : (
                      <span className="text-[11px] text-muted-foreground/40">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => {
                        setPendingRemove({ alias, modelId })
                        setConfirmOpen(true)
                      }}
                      className="rounded p-1 text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      aria-label={`Remove ${modelId} from catalog`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add to Catalog form */}
      <div className="rounded-xl border border-border/40 bg-muted/10 p-4 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider">Add to Catalog</p>
        <div className="grid gap-2 sm:grid-cols-[1.5fr_1fr_auto]">
          {/* Model ID select */}
          <div className="relative">
            <select
              value={addModelId}
              onChange={(e) => setAddModelId(e.target.value)}
              disabled={saving || availableModels.length === 0}
              className={cn(
                'w-full appearance-none rounded-lg border border-border bg-background px-3 py-1.5 pr-8',
                'font-mono text-xs text-foreground h-8',
                'focus:outline-none focus:ring-2 focus:ring-ring/50',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              <option value="" disabled>
                {availableModels.length === 0 ? 'All models catalogued' : 'Select model…'}
              </option>
              {Object.entries(byProvider).map(([provider, entries]) => (
                <optgroup key={provider} label={provider}>
                  {entries.map((m) => (
                    <option key={`${m.provider}/${m.id}`} value={`${m.provider}/${m.id}`}>
                      {m.name || m.id}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/50" />
          </div>

          {/* Alias input (optional) */}
          <Input
            placeholder="alias (optional)"
            value={addAliasName}
            onChange={(e) => setAddAliasName(e.target.value)}
            disabled={saving}
            className="h-8 text-xs font-mono"
          />

          {/* Add button */}
          <Button
            size="sm"
            variant="default"
            className="h-8 gap-1.5"
            disabled={saving || !addModelId}
            onClick={() => void handleAdd()}
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
            Add
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground/50 italic">
          Adding a model restricts access to only catalogued models
        </p>
      </div>

      {/* Confirm remove dialog */}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!removeLoading) {
            setConfirmOpen(open)
            if (!open) setPendingRemove(null)
          }
        }}
        title="Remove from Catalog"
        description={
          pendingRemove ? (
            <span>
              Remove <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">{pendingRemove.modelId}</code>{' '}
              from the model catalog?
            </span>
          ) : null
        }
        actionLabel="Remove"
        loadingLabel="Removing…"
        variant="destructive"
        loading={removeLoading}
        onConfirm={handleConfirmRemove}
      />
    </div>
  )
}
