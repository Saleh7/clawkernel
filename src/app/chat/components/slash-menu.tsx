import { memo, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { CATEGORY_LABELS, type SlashCategory, type SlashCommandDef } from '../lib/slash-commands'

type Props = {
  readonly items: SlashCommandDef[]
  readonly activeIndex: number
  readonly mode: 'command' | 'args'
  readonly argItems?: string[]
  readonly argCommand?: SlashCommandDef | null
  readonly onSelect: (item: SlashCommandDef | string) => void
  readonly onHover: (index: number) => void
}

export const SlashMenu = memo(function SlashMenu({
  items,
  activeIndex,
  mode,
  argItems,
  argCommand,
  onSelect,
  onHover,
}: Props) {
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = listRef.current?.querySelector('[data-active="true"]') as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  }, [])

  if (mode === 'args' && argItems && argCommand) {
    return (
      <div
        ref={listRef}
        className="absolute bottom-full left-0 right-0 mb-1 max-h-64 overflow-y-auto rounded-xl border border-border bg-popover shadow-lg z-50"
      >
        <div className="px-3 py-1.5 text-[10px] font-medium text-muted-foreground border-b border-border">
          /{argCommand.name} — {argCommand.desc}
        </div>
        {argItems.map((arg, i) => (
          <button
            key={arg}
            type="button"
            data-active={i === activeIndex}
            onMouseEnter={() => onHover(i)}
            onClick={() => onSelect(arg)}
            className={cn(
              'flex w-full items-center gap-2 px-3 py-1.5 text-sm text-left transition-colors',
              i === activeIndex ? 'bg-accent text-accent-foreground' : 'text-foreground hover:bg-accent/50',
            )}
          >
            <span className="font-mono">{arg}</span>
          </button>
        ))}
        <Footer />
      </div>
    )
  }

  const grouped = new Map<SlashCategory, SlashCommandDef[]>()
  for (const cmd of items) {
    const arr = grouped.get(cmd.category) || []
    arr.push(cmd)
    grouped.set(cmd.category, arr)
  }

  let globalIndex = 0

  return (
    <div
      ref={listRef}
      className="absolute bottom-full left-0 right-0 mb-1 max-h-72 overflow-y-auto rounded-xl border border-border bg-popover shadow-lg z-50"
    >
      {[...grouped.entries()].map(([cat, cmds]) => (
        <div key={cat}>
          <div className="px-3 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider sticky top-0 bg-popover/95 backdrop-blur-sm border-b border-border/50">
            {CATEGORY_LABELS[cat]}
          </div>
          {cmds.map((cmd) => {
            const idx = globalIndex++
            return (
              <button
                key={cmd.name}
                type="button"
                data-active={idx === activeIndex}
                onMouseEnter={() => onHover(idx)}
                onClick={() => onSelect(cmd)}
                className={cn(
                  'flex w-full items-center gap-2.5 px-3 py-1.5 text-sm text-left transition-colors',
                  idx === activeIndex ? 'bg-accent text-accent-foreground' : 'text-foreground hover:bg-accent/50',
                )}
              >
                <span className="w-5 text-center text-sm shrink-0">{cmd.icon}</span>
                <span className="font-mono font-medium">/{cmd.name}</span>
                <span className="text-xs text-muted-foreground truncate">{cmd.desc}</span>
                {cmd.args && <span className="ml-auto text-[10px] font-mono text-muted-foreground/60">{cmd.args}</span>}
              </button>
            )
          })}
        </div>
      ))}
      <Footer />
    </div>
  )
})

function Footer() {
  return (
    <div className="flex items-center gap-3 px-3 py-1 border-t border-border text-[10px] text-muted-foreground">
      <span>
        <kbd className="px-1 py-0.5 rounded border border-border bg-muted font-mono text-[9px]">↑↓</kbd> navigate
      </span>
      <span>
        <kbd className="px-1 py-0.5 rounded border border-border bg-muted font-mono text-[9px]">Tab</kbd> fill
      </span>
      <span>
        <kbd className="px-1 py-0.5 rounded border border-border bg-muted font-mono text-[9px]">Enter</kbd> run
      </span>
      <span>
        <kbd className="px-1 py-0.5 rounded border border-border bg-muted font-mono text-[9px]">Esc</kbd> close
      </span>
    </div>
  )
}
