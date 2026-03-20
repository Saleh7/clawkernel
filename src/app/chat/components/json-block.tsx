import { ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { JsonDetected } from '../lib/json-detect'

export function JsonBlock({ json }: { readonly json: JsonDetected }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs bg-muted/50 hover:bg-muted transition-colors text-left"
      >
        <ChevronRight className={cn('h-3 w-3 text-muted-foreground transition-transform', open && 'rotate-90')} />
        <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 font-mono font-semibold text-[10px]">
          JSON
        </span>
        <span className="text-muted-foreground truncate">{json.label}</span>
      </button>
      {open && (
        <pre className="px-3 py-2 text-xs font-mono text-foreground/80 overflow-auto max-h-80 bg-card/50">
          <code>{json.pretty}</code>
        </pre>
      )}
    </div>
  )
}
