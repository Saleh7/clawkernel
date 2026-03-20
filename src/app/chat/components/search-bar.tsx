import { Search, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function SearchBar({
  query,
  onChange,
  onClose,
  matchCount,
}: {
  readonly query: string
  readonly onChange: (q: string) => void
  readonly onClose: () => void
  readonly matchCount: number
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  return (
    <div className="flex items-center gap-2 px-4 py-1.5 border-b border-border bg-muted/30">
      <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <Input
        ref={inputRef}
        value={query}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose()
        }}
        placeholder="Search messages…"
        className="h-7 text-xs border-0 bg-transparent shadow-none focus-visible:ring-0 px-0"
      />
      {query && (
        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
          {matchCount} match{matchCount === 1 ? '' : 'es'}
        </span>
      )}
      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={onClose}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
