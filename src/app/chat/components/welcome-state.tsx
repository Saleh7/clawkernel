import { Bot, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AgentInfo } from '../types'

const SUGGESTIONS = [
  'What can you do?',
  'Summarize my recent sessions',
  'Help me configure a channel',
  'Check system health',
]

export function WelcomeState({
  agentInfo,
  onSend,
}: {
  readonly agentInfo?: AgentInfo
  readonly onSend: (text: string) => void
}) {
  const name = agentInfo?.name || 'Assistant'

  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="text-center space-y-4 px-4 max-w-md">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/50 text-2xl">
          {agentInfo?.emoji || <Bot className="h-8 w-8 text-muted-foreground" />}
        </div>
        <h3 className="text-lg font-semibold text-foreground">{name}</h3>
        <p className="text-sm text-muted-foreground flex items-center justify-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5" />
          Ready to chat · Type{' '}
          <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted font-mono text-[11px]">/</kbd> for
          commands
        </p>
        <div className="flex flex-wrap justify-center gap-2 pt-2">
          {SUGGESTIONS.map((text) => (
            <button
              key={text}
              type="button"
              onClick={() => onSend(text)}
              className={cn(
                'rounded-full border border-border px-3.5 py-1.5 text-xs text-muted-foreground',
                'transition-colors hover:bg-accent hover:text-foreground hover:border-accent',
              )}
            >
              {text}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
