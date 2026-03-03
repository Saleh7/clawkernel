import { Bot, ChevronDown, Loader2, Wrench } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import type { ChatMessage } from '@/lib/gateway/types'
import { cn } from '@/lib/utils'
import type { AgentInfo, ChatSettings } from '../types'
import { extractToolCalls } from '../utils'

// ---------------------------------------------------------------------------
//  Single Tool Call Block
// ---------------------------------------------------------------------------

export function ToolCallBlock({
  name,
  args,
  result,
  isError,
}: {
  readonly name: string
  readonly args: Record<string, unknown>
  readonly result?: string
  readonly isError?: boolean
}) {
  const [open, setOpen] = useState(false)
  const argsStr = JSON.stringify(args, null, 2)

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex items-center gap-2 rounded-lg border px-3 py-2 text-xs w-full text-left transition-colors',
            'border-border bg-card/50 hover:bg-card',
            isError && 'border-destructive/30',
          )}
        >
          <Wrench className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="font-mono font-medium text-foreground">{name}</span>
          {result !== undefined ? (
            <Badge variant={isError ? 'destructive' : 'secondary'} className="ml-auto text-[10px]">
              {isError ? 'Error' : 'Done'}
            </Badge>
          ) : (
            <Loader2 className="ml-auto h-3 w-3 animate-spin text-muted-foreground" />
          )}
          <ChevronDown className={cn('h-3 w-3 text-muted-foreground transition-transform', open && 'rotate-180')} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 rounded-lg border border-border bg-card/30 p-3 text-xs font-mono space-y-2">
          {argsStr !== '{}' && (
            <div>
              <span className="text-muted-foreground text-[10px] uppercase tracking-wider">Input</span>
              <pre className="mt-1 whitespace-pre-wrap text-foreground/80 max-h-40 overflow-auto">{argsStr}</pre>
            </div>
          )}
          {result !== undefined && (
            <div>
              <span
                className={cn(
                  'text-[10px] uppercase tracking-wider',
                  isError ? 'text-destructive' : 'text-muted-foreground',
                )}
              >
                {isError ? 'Error' : 'Output'}
              </span>
              <pre className="mt-1 whitespace-pre-wrap text-foreground/80 max-h-60 overflow-auto">{result}</pre>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

// ---------------------------------------------------------------------------
//  Tool Group — multiple tool-only messages collapsed
// ---------------------------------------------------------------------------

export function ToolGroup({
  messages,
  agentInfo,
  toolResults,
  settings,
}: {
  readonly messages: ChatMessage[]
  readonly agentInfo?: AgentInfo
  readonly toolResults: Map<string, { content: string; isError: boolean; details?: Record<string, unknown> }>
  readonly settings: ChatSettings
}) {
  const [open, setOpen] = useState(false)

  const allToolCalls = useMemo(() => {
    const calls: { id: string; name: string; arguments: Record<string, unknown> }[] = []
    for (const msg of messages) calls.push(...extractToolCalls(msg))
    return calls
  }, [messages])

  if (!settings.showToolCalls || allToolCalls.length === 0) return null

  const doneCount = allToolCalls.filter((tc) => toolResults.has(tc.id)).length
  const allDone = doneCount === allToolCalls.length

  return (
    <div className="flex gap-3 px-4 py-1">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground text-sm">
        {agentInfo?.emoji || <Bot className="h-4 w-4" />}
      </div>
      <div className="flex-1 min-w-0 max-w-[75%]">
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 rounded-xl border border-border bg-card/50 hover:bg-card px-3 py-2 text-xs w-full text-left transition-colors"
            >
              <Wrench className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="font-medium text-foreground">
                {allToolCalls.length} tool{allToolCalls.length !== 1 ? 's' : ''} used
              </span>
              {allDone ? (
                <Badge variant="secondary" className="ml-auto text-[10px]">
                  {doneCount}/{allToolCalls.length} done
                </Badge>
              ) : (
                <Loader2 className="ml-auto h-3 w-3 animate-spin text-muted-foreground" />
              )}
              <ChevronDown className={cn('h-3 w-3 text-muted-foreground transition-transform', open && 'rotate-180')} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-1 space-y-1">
              {allToolCalls.map((tc) => (
                <ToolCallBlock
                  key={tc.id || tc.name}
                  name={tc.name}
                  args={tc.arguments}
                  result={toolResults.get(tc.id)?.content}
                  isError={toolResults.get(tc.id)?.isError}
                />
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  )
}
