import { X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Markdown } from '@/components/prompt-kit/markdown'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'

const MIN_WIDTH = 280
const MAX_WIDTH = 700
const DEFAULT_WIDTH = 400

export function ToolSidebar({
  content,
  open,
  onClose,
}: {
  readonly content: string | null
  readonly open: boolean
  readonly onClose: () => void
}) {
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const widthRef = useRef(width)
  widthRef.current = width
  const dragging = useRef(false)
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(
    () => () => {
      cleanupRef.current?.()
    },
    [],
  )

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    const startX = e.clientX
    const startW = widthRef.current

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return
      setWidth(Math.max(MIN_WIDTH, Math.min(startW + (startX - ev.clientX), MAX_WIDTH)))
    }
    const onUp = () => {
      dragging.current = false
      cleanupRef.current = null
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    cleanupRef.current = onUp
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [])

  if (!open || !content) return null

  return (
    <div className="flex h-full shrink-0 border-l border-border" style={{ width }}>
      <button
        type="button"
        aria-label="Resize sidebar"
        className="w-1 cursor-col-resize hover:bg-primary/20 active:bg-primary/30 transition-colors shrink-0 border-0 bg-transparent p-0"
        onMouseDown={handleMouseDown}
      />
      <div className="flex flex-1 flex-col min-w-0 bg-background">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <span className="text-xs font-semibold text-foreground">Tool Output</span>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-4 text-sm">
            <Markdown>{content}</Markdown>
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
