import { CheckCircle2, ChevronDown, Loader2, Pencil, Plus, Server, Trash2, XCircle } from 'lucide-react'
import { useState } from 'react'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { ModelCatalogEntry } from '@/lib/gateway/types'
import { cn } from '@/lib/utils'
import type { CustomProvider } from '../hooks/use-models'

type Props = {
  readonly models: ModelCatalogEntry[]
  readonly customProviders: CustomProvider[]
  readonly saving: boolean
  readonly onAddCustomProvider: (id: string, baseUrl: string, apiKey: string) => Promise<void>
  readonly onRemoveCustomProvider: (id: string) => Promise<void>
  readonly onEditCustomProvider: (id: string, baseUrl: string, apiKey: string) => Promise<void>
}

export function ProviderStatus({
  models,
  customProviders,
  saving,
  onAddCustomProvider,
  onRemoveCustomProvider,
  onEditCustomProvider,
}: Props) {
  const activeProviders = models.reduce<Map<string, number>>((acc, m) => {
    acc.set(m.provider, (acc.get(m.provider) ?? 0) + 1)
    return acc
  }, new Map())

  const [showAddForm, setShowAddForm] = useState(false)
  const [newId, setNewId] = useState('')
  const [newBaseUrl, setNewBaseUrl] = useState('')
  const [newApiKey, setNewApiKey] = useState('')
  const [addLoading, setAddLoading] = useState(false)

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingRemove, setPendingRemove] = useState<string | null>(null)
  const [removeLoading, setRemoveLoading] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editBaseUrl, setEditBaseUrl] = useState('')
  const [editApiKey, setEditApiKey] = useState('')
  const [editLoading, setEditLoading] = useState(false)

  const handleAdd = async () => {
    const id = newId.trim()
    const baseUrl = newBaseUrl.trim()
    if (!id || !baseUrl) return
    setAddLoading(true)
    try {
      await onAddCustomProvider(id, baseUrl, newApiKey.trim())
      setNewId('')
      setNewBaseUrl('')
      setNewApiKey('')
      setShowAddForm(false)
    } finally {
      setAddLoading(false)
    }
  }

  const handleConfirmRemove = async () => {
    if (!pendingRemove) return
    setRemoveLoading(true)
    try {
      await onRemoveCustomProvider(pendingRemove)
    } finally {
      setRemoveLoading(false)
      setConfirmOpen(false)
      setPendingRemove(null)
    }
  }

  const handleEditSave = async () => {
    if (!editingId) return
    const baseUrl = editBaseUrl.trim()
    if (!baseUrl) return
    setEditLoading(true)
    try {
      await onEditCustomProvider(editingId, baseUrl, editApiKey.trim())
      setEditingId(null)
      setEditBaseUrl('')
      setEditApiKey('')
    } finally {
      setEditLoading(false)
    }
  }

  const handleEditOpen = (provider: CustomProvider) => {
    setEditingId(provider.id)
    setEditBaseUrl(provider.baseUrl)
    setEditApiKey('')
  }

  const handleEditCancel = () => {
    setEditingId(null)
    setEditBaseUrl('')
    setEditApiKey('')
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Providers</p>

      {/* Active providers chips */}
      {activeProviders.size > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider">Active</p>
          <div className="flex flex-wrap gap-2">
            {[...activeProviders.entries()]
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([provider, count]) => (
                <div
                  key={provider}
                  className="flex items-center gap-1.5 rounded-lg border border-border/40 bg-card/80 px-3 py-1.5"
                >
                  <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                  <span className="text-xs font-semibold text-foreground">{provider}</span>
                  <span className="text-[10px] text-muted-foreground/60">
                    {count} model{count !== 1 ? 's' : ''}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Custom providers */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider">Custom Providers</p>
        {customProviders.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-border/40 py-6 gap-2">
            <Server className="h-5 w-5 text-muted-foreground/20" />
            <p className="text-xs text-muted-foreground/50">No custom providers configured</p>
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {customProviders.map((provider) => (
              <div
                key={provider.id}
                className="flex flex-col gap-2 rounded-xl border border-border/40 bg-card/80 px-4 py-3"
              >
                {editingId === provider.id ? (
                  /* Inline edit form */
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-foreground">{provider.id}</p>
                    <Input
                      placeholder="Base URL"
                      value={editBaseUrl}
                      onChange={(e) => setEditBaseUrl(e.target.value)}
                      disabled={editLoading}
                      className="h-7 text-xs font-mono"
                    />
                    <Input
                      type="password"
                      placeholder="Leave blank to keep current key"
                      value={editApiKey}
                      onChange={(e) => setEditApiKey(e.target.value)}
                      disabled={editLoading}
                      className="h-7 text-xs font-mono"
                    />
                    <div className="flex gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="default"
                        className="h-6 px-2 text-[10px]"
                        disabled={editLoading || !editBaseUrl.trim()}
                        onClick={() => void handleEditSave()}
                      >
                        {editLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save'}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-[10px]"
                        disabled={editLoading}
                        onClick={handleEditCancel}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  /* Display mode */
                  <div className="flex items-center gap-3">
                    <Server className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-foreground truncate">{provider.id}</p>
                      <p className="text-[10px] text-muted-foreground/50 truncate font-mono">{provider.baseUrl}</p>
                      <div className="mt-0.5">
                        {provider.hasApiKey ? (
                          <Badge
                            variant="outline"
                            className="text-[9px] border-emerald-500/30 text-emerald-600 dark:text-emerald-400 gap-0.5"
                          >
                            <CheckCircle2 className="h-2 w-2" />
                            key configured
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-[9px] border-amber-500/30 text-amber-600 dark:text-amber-400 gap-0.5"
                          >
                            <XCircle className="h-2 w-2" />
                            no key
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => handleEditOpen(provider)}
                        className="rounded p-1 text-muted-foreground/30 hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        aria-label={`Edit provider ${provider.id}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => {
                          setPendingRemove(provider.id)
                          setConfirmOpen(true)
                        }}
                        className="rounded p-1 text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        aria-label={`Remove provider ${provider.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Custom Provider — collapsible */}
      <div className="rounded-xl border border-border/40 bg-muted/10 overflow-hidden">
        <button
          type="button"
          className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider hover:bg-muted/20 transition-colors"
          onClick={() => setShowAddForm((v) => !v)}
        >
          <div className="flex items-center gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Add Custom Provider
          </div>
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showAddForm && 'rotate-180')} />
        </button>

        {showAddForm && (
          <div className="px-4 pb-4 space-y-3 border-t border-border/40">
            <div className="grid gap-2 pt-3 sm:grid-cols-3">
              <Input
                placeholder="Provider ID"
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
                disabled={addLoading}
                className="h-8 text-xs font-mono"
              />
              <Input
                placeholder="Base URL"
                value={newBaseUrl}
                onChange={(e) => setNewBaseUrl(e.target.value)}
                disabled={addLoading}
                className="h-8 text-xs font-mono"
              />
              <Input
                type="password"
                placeholder="API Key (optional)"
                value={newApiKey}
                onChange={(e) => setNewApiKey(e.target.value)}
                disabled={addLoading}
                className="h-8 text-xs font-mono"
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] text-muted-foreground/50 italic">
                For Anthropic, OpenAI, Google — configure via environment variables or CLI
              </p>
              <Button
                size="sm"
                variant="default"
                className="h-7 gap-1.5 text-xs shrink-0"
                disabled={addLoading || !newId.trim() || !newBaseUrl.trim()}
                onClick={() => void handleAdd()}
              >
                {addLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                Add
              </Button>
            </div>
          </div>
        )}
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
        title="Remove Custom Provider"
        description={
          pendingRemove ? (
            <span>
              Remove custom provider{' '}
              <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">{pendingRemove}</code>? This cannot be
              undone.
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
