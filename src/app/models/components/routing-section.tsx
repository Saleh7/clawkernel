import { ArrowRight, ImageIcon, Loader2, Plus, X, Zap } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { ModelCatalogEntry } from '@/lib/gateway/types'
import type { AgentModelConfig } from '../hooks/use-models'
import { resolveModelFallbacks, resolveModelPrimary } from '../hooks/use-models'
import { ModelPicker } from './model-picker'

// ---------------------------------------------------------------------------
//  Single interactive model card
// ---------------------------------------------------------------------------

type ModelCardProps = {
  icon: React.ElementType
  label: string
  model: AgentModelConfig
  models: ModelCatalogEntry[]
  saving: boolean
  onSetModel: (model: string) => Promise<void>
  onAddFallback: (fallback: string) => Promise<void>
  onRemoveFallback: (fallback: string) => Promise<void>
}

function ModelCard({
  icon: Icon,
  label,
  model,
  models,
  saving,
  onSetModel,
  onAddFallback,
  onRemoveFallback,
}: ModelCardProps) {
  const primary = resolveModelPrimary(model)
  const fallbacks = resolveModelFallbacks(model)

  const [showChangePrimary, setShowChangePrimary] = useState(false)
  const [showAddFallback, setShowAddFallback] = useState(false)
  const [selectedPrimary, setSelectedPrimary] = useState('')
  const [selectedFallback, setSelectedFallback] = useState('')

  const handleSetPrimary = async () => {
    if (!selectedPrimary) return
    await onSetModel(selectedPrimary)
    setShowChangePrimary(false)
    setSelectedPrimary('')
  }

  const handleAddFallback = async () => {
    if (!selectedFallback) return
    await onAddFallback(selectedFallback)
    setShowAddFallback(false)
    setSelectedFallback('')
  }

  const excludeFromFallback = [primary !== '—' ? primary : '', ...fallbacks].filter(Boolean)

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border/40 bg-card/80 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10">
            <Icon className="h-3 w-3 text-primary" />
          </div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[10px]"
          disabled={saving || models.length === 0}
          onClick={() => {
            setShowAddFallback(false)
            setShowChangePrimary((v) => !v)
            setSelectedPrimary('')
          }}
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Change'}
        </Button>
      </div>

      {/* Primary model */}
      <div className="flex items-center gap-2">
        <code className="rounded-md bg-muted px-2 py-1 text-xs font-mono text-foreground">{primary}</code>
        {primary !== '—' && (
          <Badge variant="secondary" className="text-[9px]">
            primary
          </Badge>
        )}
      </div>

      {/* Inline change-primary picker */}
      {showChangePrimary && (
        <div className="flex gap-2 items-center">
          <div className="flex-1">
            <ModelPicker
              models={models}
              value={selectedPrimary}
              onChange={setSelectedPrimary}
              placeholder="Select model…"
              disabled={saving}
            />
          </div>
          <Button
            size="sm"
            variant="default"
            className="h-7 px-2 text-xs"
            disabled={saving || !selectedPrimary}
            onClick={() => void handleSetPrimary()}
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Set'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            disabled={saving}
            onClick={() => {
              setShowChangePrimary(false)
              setSelectedPrimary('')
            }}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Fallback chain */}
      {fallbacks.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pl-1">
          {fallbacks.map((fb, i) => (
            <div key={fb} className="flex items-center gap-1">
              {i === 0 && <ArrowRight className="h-3 w-3 text-muted-foreground/40" />}
              {i > 0 && <ArrowRight className="h-3 w-3 text-muted-foreground/30" />}
              <code className="rounded bg-muted/60 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                {fb}
              </code>
              <button
                type="button"
                onClick={() => void onRemoveFallback(fb)}
                disabled={saving}
                className="ml-0.5 rounded p-0.5 text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label={`Remove fallback ${fb}`}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
          ))}
          <span className="text-[9px] text-muted-foreground/40 ml-0.5">fallback{fallbacks.length > 1 ? 's' : ''}</span>
        </div>
      )}

      {/* Add fallback row */}
      {showAddFallback ? (
        <div className="flex gap-2 items-center">
          <div className="flex-1">
            <ModelPicker
              models={models}
              value={selectedFallback}
              onChange={setSelectedFallback}
              placeholder="Select fallback…"
              exclude={excludeFromFallback}
              disabled={saving}
            />
          </div>
          <Button
            size="sm"
            variant="default"
            className="h-7 px-2 text-xs"
            disabled={saving || !selectedFallback}
            onClick={() => void handleAddFallback()}
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Add'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            disabled={saving}
            onClick={() => {
              setShowAddFallback(false)
              setSelectedFallback('')
            }}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1 self-start text-[10px] text-muted-foreground"
          disabled={saving || primary === '—' || models.length === 0}
          onClick={() => {
            setShowChangePrimary(false)
            setShowAddFallback(true)
            setSelectedFallback('')
          }}
        >
          <Plus className="h-3 w-3" />
          Add Fallback
        </Button>
      )}

      {primary === '—' && !showChangePrimary && (
        <p className="text-xs text-muted-foreground/40 italic">Not configured</p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
//  RoutingSection
// ---------------------------------------------------------------------------

type Props = {
  defaultModel: AgentModelConfig
  imageModel: AgentModelConfig
  models: ModelCatalogEntry[]
  saving: boolean
  saveError: string | null
  onSetDefaultModel: (model: string) => Promise<void>
  onAddDefaultFallback: (fallback: string) => Promise<void>
  onRemoveDefaultFallback: (fallback: string) => Promise<void>
  onSetImageModel: (model: string) => Promise<void>
  onAddImageFallback: (fallback: string) => Promise<void>
  onRemoveImageFallback: (fallback: string) => Promise<void>
}

export function RoutingSection({
  defaultModel,
  imageModel,
  models,
  saving,
  saveError,
  onSetDefaultModel,
  onAddDefaultFallback,
  onRemoveDefaultFallback,
  onSetImageModel,
  onAddImageFallback,
  onRemoveImageFallback,
}: Props) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Routing</p>

      {saveError && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {saveError}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <ModelCard
          icon={Zap}
          label="Default Model"
          model={defaultModel}
          models={models}
          saving={saving}
          onSetModel={onSetDefaultModel}
          onAddFallback={onAddDefaultFallback}
          onRemoveFallback={onRemoveDefaultFallback}
        />
        <ModelCard
          icon={ImageIcon}
          label="Image Model"
          model={imageModel}
          models={models}
          saving={saving}
          onSetModel={onSetImageModel}
          onAddFallback={onAddImageFallback}
          onRemoveFallback={onRemoveImageFallback}
        />
      </div>
    </div>
  )
}
