import { ChevronDown } from 'lucide-react'
import type { ModelCatalogEntry } from '@/lib/gateway/types'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
//  Shared ModelPicker — native select with optgroup per provider
// ---------------------------------------------------------------------------

type ModelPickerProps = {
  models: ModelCatalogEntry[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  exclude?: string[] // provider/model-id strings to exclude
  disabled?: boolean
  className?: string
}

export function ModelPicker({
  models,
  value,
  onChange,
  placeholder,
  exclude = [],
  disabled,
  className,
}: ModelPickerProps) {
  const available = models.filter((m) => !exclude.includes(`${m.provider}/${m.id}`))

  const byProvider = available.reduce<Record<string, ModelCatalogEntry[]>>((acc, m) => {
    const p = m.provider || 'other'
    ;(acc[p] ??= []).push(m)
    return acc
  }, {})

  return (
    <div className={cn('relative', className)}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={cn(
          'w-full appearance-none rounded-lg border border-border bg-background px-3 py-1.5 pr-8',
          'font-mono text-xs text-foreground',
          'focus:outline-none focus:ring-2 focus:ring-ring/50',
          'disabled:opacity-50 disabled:cursor-not-allowed',
        )}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
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
  )
}
