import { ChevronDown } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { ModelCatalogEntry, ModelsListResult } from '@/lib/gateway/types'
import { createLogger } from '@/lib/logger'
import { cn } from '@/lib/utils'
import { selectClient, useGatewayStore } from '@/stores/gateway-store'

const log = createLogger('chat:model-selector')

export function ModelSelector({
  sessionKey,
  currentModel,
  defaultModel,
  disabled,
  onModelChange,
}: {
  readonly sessionKey: string
  readonly currentModel?: string
  readonly defaultModel?: string | null
  readonly disabled?: boolean
  readonly onModelChange?: () => void
}) {
  const client = useGatewayStore(selectClient)
  const [models, setModels] = useState<ModelCatalogEntry[]>([])
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    if (!open || !client?.connected || models.length > 0) return
    client.request<ModelsListResult>('models.list', {}).then(
      (r) => setModels(r.models ?? []),
      (err) => log.warn('models.list failed', err),
    )
  }, [open, client, models.length])

  const displayModel = currentModel || defaultModel || 'default'
  const shortModel = displayModel.includes('/') ? displayModel.split('/').pop()! : displayModel
  const provider = displayModel.includes('/') ? displayModel.split('/')[0] : null

  const handleSelect = useCallback(
    async (modelId: string) => {
      if (!client?.connected) return
      setOpen(false)
      try {
        await client.request('sessions.patch', { key: sessionKey, model: modelId || null })
        onModelChange?.()
      } catch (err) {
        toast.error('Failed to change model')
        log.warn('Model change failed', err)
      }
    },
    [client, sessionKey, onModelChange],
  )

  const q = filter.toLowerCase()
  const filtered = q
    ? models.filter((m) => m.id.toLowerCase().includes(q) || m.provider?.toLowerCase().includes(q))
    : models

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11px] font-mono',
            'text-muted-foreground hover:text-foreground',
            'border border-transparent hover:border-border',
            'transition-colors duration-100',
            'disabled:opacity-40 disabled:cursor-not-allowed',
          )}
        >
          <span className="truncate max-w-[120px]">{shortModel}</span>
          {provider && <span className="text-muted-foreground/50 hidden sm:inline">· {provider}</span>}
          <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0" sideOffset={8}>
        <div className="p-2 border-b border-border">
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search models…"
            className="h-7 text-xs"
            autoFocus
          />
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          <button
            type="button"
            onClick={() => handleSelect('')}
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-left',
              'hover:bg-accent transition-colors',
              !currentModel && 'bg-accent/50 font-medium',
            )}
          >
            <span className="truncate">Default{defaultModel ? ` (${defaultModel})` : ''}</span>
          </button>
          {filtered.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => handleSelect(m.id)}
              className={cn(
                'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs text-left',
                'hover:bg-accent transition-colors',
                m.id === currentModel && 'bg-accent/50 font-medium',
              )}
            >
              <span className="truncate font-mono">{m.id}</span>
              {m.provider && <span className="text-[10px] text-muted-foreground/60 shrink-0">{m.provider}</span>}
            </button>
          ))}
          {filtered.length === 0 && models.length > 0 && (
            <div className="px-2 py-3 text-xs text-muted-foreground text-center">No matching models</div>
          )}
          {models.length === 0 && <div className="px-2 py-3 text-xs text-muted-foreground text-center">Loading…</div>}
        </div>
      </PopoverContent>
    </Popover>
  )
}
