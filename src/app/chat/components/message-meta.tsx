import { cn } from '@/lib/utils'
import type { MessageMeta } from '../lib/message-meta'
import { formatMeta } from '../lib/message-meta'

export function MessageMetaBadge({ meta }: { readonly meta: MessageMeta }) {
  const parts = formatMeta(meta)
  if (parts.length === 0) return null

  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground/70">
      {parts.map((p) => (
        <span
          key={p}
          className={cn(
            p.includes('ctx') && meta.contextPct !== null && meta.contextPct >= 90 && 'text-destructive',
            p.includes('ctx') &&
              meta.contextPct !== null &&
              meta.contextPct >= 75 &&
              meta.contextPct < 90 &&
              'text-yellow-500',
          )}
        >
          {p}
        </span>
      ))}
    </span>
  )
}
