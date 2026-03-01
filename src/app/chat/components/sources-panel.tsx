import { ExternalLink, Link2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { Source } from '../types'

/** Only allow http/https URLs in citation links */
function safeHref(url: string): string | undefined {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? url : undefined
  } catch {
    return undefined // Invalid URL — expected for user-generated content
  }
}

export function SourcesButton({ sources, onClick }: { sources: Source[]; onClick: () => void }) {
  if (sources.length === 0) return null
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-1 inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <div className="flex -space-x-1.5">
        {sources.slice(0, 4).map((s) => (
          <span
            key={s.url}
            className="flex h-4 w-4 items-center justify-center rounded-full bg-muted text-[8px] font-bold uppercase text-muted-foreground ring-1 ring-background"
          >
            {s.domain.charAt(0)}
          </span>
        ))}
      </div>
      <Link2 className="h-3 w-3" />
      <span>
        {sources.length} source{sources.length !== 1 ? 's' : ''}
      </span>
    </button>
  )
}

export function SourcesPanel({ sources, open, onClose }: { sources: Source[]; open: boolean; onClose: () => void }) {
  if (!open) return null
  return (
    <>
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close panel"
        className="fixed inset-0 z-40 w-full cursor-default bg-background/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-popover shadow-xl border-l border-border sm:w-[400px]">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold text-foreground">Citations</h2>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-2 p-4">
            {sources.map((s) => (
              <a
                key={s.url}
                href={safeHref(s.url)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col gap-1.5 rounded-lg border border-border p-3 text-left transition-colors hover:bg-accent/50 group"
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-muted text-[8px] font-bold uppercase text-muted-foreground">
                    {s.domain.charAt(0)}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{s.domain}</span>
                  <ExternalLink className="h-3 w-3 text-muted-foreground ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <span className="text-sm font-medium text-foreground line-clamp-2">{s.title}</span>
                {s.snippet && <span className="text-xs text-muted-foreground line-clamp-2">{s.snippet}</span>}
              </a>
            ))}
          </div>
        </ScrollArea>
      </div>
    </>
  )
}
