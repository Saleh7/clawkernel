import { RefreshCw, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { AdvancedSettings } from './components/advanced-settings'
import { AliasesSection } from './components/aliases-section'
import { ModelsList } from './components/models-list'
import { ProviderStatus } from './components/provider-status'
import { useModels } from './hooks/use-models'

export default function ModelsPage() {
  const {
    models,
    loading,
    refresh,
    defaultModel,
    imageModel,
    aliases,
    customProviders,
    saving,
    saveError,
    setDefaultModel,
    addDefaultFallback,
    removeDefaultFallback,
    setImageModel,
    addImageFallback,
    removeImageFallback,
    addAlias,
    removeAlias,
    agentList,
    setAgentModel,
    heartbeatModel,
    setHeartbeatModel,
    addCustomProvider,
    removeCustomProvider,
    editCustomProvider,
  } = useModels()

  const withToast =
    <TArgs extends unknown[]>(label: string, fn: (...args: TArgs) => Promise<void>) =>
    async (...args: TArgs): Promise<void> => {
      try {
        await fn(...args)
        toast.success(`${label} updated`)
      } catch {
        // error already logged and surface-level reported in withSave (use-models.ts)
        toast.error(`Failed to update ${label}`)
      }
    }

  return (
    <div className="flex flex-col gap-8 p-6">
      {/* Header */}
      <PageHeader
        icon={Sparkles}
        title="Models"
        description="Browse available models and manage routing configuration"
        badge={!loading && models.length > 0 ? String(models.length) : undefined}
      >
        <Button size="sm" variant="outline" onClick={() => void refresh()} disabled={loading} className="gap-1.5">
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          Refresh
        </Button>
      </PageHeader>

      {/* Model Catalog (was Aliases) — most important, at top */}
      <AliasesSection
        aliases={aliases}
        models={models}
        saving={saving}
        onAddAlias={withToast('catalog', addAlias)}
        onRemoveAlias={withToast('catalog', removeAlias)}
      />

      {/* Providers */}
      <ProviderStatus
        models={models}
        customProviders={customProviders}
        saving={saving}
        onAddCustomProvider={withToast('provider', addCustomProvider)}
        onRemoveCustomProvider={withToast('provider', removeCustomProvider)}
        onEditCustomProvider={withToast('provider', editCustomProvider)}
      />

      {/* Advanced Settings — collapsible, contains Per-Agent · Heartbeat · Routing tabs */}
      <AdvancedSettings
        agentList={agentList}
        heartbeatModel={heartbeatModel}
        defaultModel={defaultModel}
        imageModel={imageModel}
        models={models}
        saving={saving}
        saveError={saveError}
        onSetAgentModel={withToast('agent model', setAgentModel)}
        onSetHeartbeatModel={withToast('heartbeat model', setHeartbeatModel)}
        onSetDefaultModel={withToast('default model', setDefaultModel)}
        onAddDefaultFallback={withToast('default fallback', addDefaultFallback)}
        onRemoveDefaultFallback={withToast('default fallback', removeDefaultFallback)}
        onSetImageModel={withToast('image model', setImageModel)}
        onAddImageFallback={withToast('image fallback', addImageFallback)}
        onRemoveImageFallback={withToast('image fallback', removeImageFallback)}
      />

      {/* Available Models */}
      {loading ? (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Available Models</p>
          <div className="space-y-1">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded-lg bg-muted/30" />
            ))}
          </div>
        </div>
      ) : (
        <ModelsList models={models} />
      )}
    </div>
  )
}
