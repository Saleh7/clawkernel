import { Bot, Loader2, MessageSquare, RefreshCw, Sparkles, WifiOff, X, Zap } from 'lucide-react'
import { useEffect } from 'react'
import { TypingLoader } from '@/components/prompt-kit/loader'
import { Markdown } from '@/components/prompt-kit/markdown'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { formatTokens } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { AgentInfo } from '../types'

function connectionMessage(state: string, isRestarting: boolean): string {
  if (isRestarting) return 'Gateway restarting, reconnecting…'
  if (state === 'connecting' || state === 'authenticating') return 'Connecting…'
  if (state === 'reconnecting') return 'Reconnecting…'
  return 'Disconnected'
}

function contextMeterTone(pct: number): string {
  if (pct > 80) return 'text-destructive'
  if (pct > 60) return 'text-[var(--warn)]'
  return 'text-primary'
}
export function ConnectionBanner({ state, error }: { readonly state: string; readonly error?: string | null }) {
  if (state === 'connected') return null
  const isRestarting = error?.includes('Gateway restarting')
  const message = connectionMessage(state, Boolean(isRestarting))

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-4 py-2 border-b text-xs',
        isRestarting
          ? 'bg-warning/10 border-warning/20 text-warning'
          : 'bg-destructive/10 border-destructive/20 text-destructive',
      )}
    >
      {isRestarting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <WifiOff className="h-3.5 w-3.5" />}
      <span>{message}</span>
      {(state === 'connecting' || state === 'reconnecting' || state === 'authenticating') && !isRestarting && (
        <Loader2 className="h-3 w-3 animate-spin" />
      )}
    </div>
  )
}
export function EmptyState({ hasSession }: { readonly hasSession: boolean }) {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="text-center space-y-3 px-4">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/50">
          <MessageSquare className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold text-foreground">{hasSession ? 'No messages yet' : 'Select a session'}</h3>
        <p className="text-sm text-muted-foreground max-w-xs">
          {hasSession
            ? 'Send a message to start chatting with this agent.'
            : 'Pick a session from the sidebar to view the conversation.'}
        </p>
      </div>
    </div>
  )
}
export function StreamingBubble({ text, agentInfo }: { readonly text: string | null; readonly agentInfo?: AgentInfo }) {
  return (
    <div className="flex gap-3 px-4 py-2">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground text-sm">
        {agentInfo?.emoji || <Bot className="h-4 w-4" />}
      </div>
      <div className="flex flex-col gap-1 max-w-[75%] min-w-0">
        {text ? (
          <div className="rounded-2xl rounded-bl-md px-4 py-2.5 text-sm leading-relaxed bg-card text-card-foreground border border-border overflow-hidden animate-pulse-border">
            <Markdown>{text}</Markdown>
          </div>
        ) : (
          <div className="rounded-2xl rounded-bl-md px-4 py-3 bg-card border border-border animate-pulse-border">
            <TypingLoader size="sm" />
          </div>
        )}
      </div>
    </div>
  )
}
export function ProcessingIndicator({ agentInfo }: { readonly agentInfo?: AgentInfo }) {
  return (
    <div className="flex gap-3 px-4 py-2">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground text-sm">
        {agentInfo?.emoji || <Bot className="h-4 w-4" />}
      </div>
      <div className="rounded-2xl rounded-bl-md px-4 py-3 bg-card border border-border">
        <TypingLoader size="sm" />
      </div>
    </div>
  )
}
export function CompactionIndicator({ active }: { readonly active: boolean }) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 px-4 py-1.5 border-b text-xs',
        active
          ? 'bg-primary/10 border-primary/20 text-primary'
          : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400',
      )}
    >
      {active ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>Compacting context…</span>
        </>
      ) : (
        <>
          <Sparkles className="h-3.5 w-3.5" />
          <span>Context compacted</span>
        </>
      )}
    </div>
  )
}
export function FallbackIndicator({
  status,
}: {
  readonly status: {
    readonly phase: 'active' | 'cleared'
    readonly selected: string
    readonly active: string
    readonly previous?: string
    readonly reason?: string
    readonly attempts: string[]
  }
}) {
  const isCleared = status.phase === 'cleared'
  return (
    <div
      className={cn(
        'flex items-center gap-2 px-4 py-1.5 border-b text-xs',
        isCleared
          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
          : 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400',
      )}
      title={[
        `Selected: ${status.selected}`,
        `Active: ${status.active}`,
        status.previous ? `Previous: ${status.previous}` : null,
        status.reason ? `Reason: ${status.reason}` : null,
        status.attempts.length > 0 ? `Attempts: ${status.attempts.slice(0, 3).join(' | ')}` : null,
      ]
        .filter(Boolean)
        .join(' • ')}
    >
      <Zap className="h-3.5 w-3.5" />
      <span>{isCleared ? `Fallback cleared: ${status.selected}` : `Fallback active: ${status.active}`}</span>
    </div>
  )
}
export function ContextMeter({ used, max }: { readonly used?: number; readonly max?: number }) {
  if (!used || !max || max <= 0) return null
  const pct = Math.min((used / max) * 100, 100)
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              'flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors',
              pct > 80 && 'animate-pulse',
            )}
          >
            <svg viewBox="0 0 36 36" className="h-4 w-4 -rotate-90" aria-hidden="true">
              <circle
                cx="18"
                cy="18"
                r="15.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                className="text-border"
              />
              <circle
                cx="18"
                cy="18"
                r="15.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                className={cn(contextMeterTone(pct))}
                strokeLinecap="round"
                strokeDasharray={`${(pct / 100) * 97.4} 97.4`}
              />
            </svg>
            <span className="font-mono text-[11px] hidden sm:inline">{pct.toFixed(0)}%</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-xs space-y-0.5">
            <div className="font-medium">Context window</div>
            <div className="font-mono">
              {formatTokens(used)} / {formatTokens(max)} tokens
            </div>
            <div className="text-muted-foreground">{Math.max(0, 100 - pct).toFixed(0)}% remaining</div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
export function ImageLightbox({ src, onClose }: { readonly src: string; readonly onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    globalThis.addEventListener('keydown', handler)
    return () => globalThis.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <dialog
      open
      aria-modal="true"
      aria-label="Image viewer"
      className="fixed inset-0 z-50 m-0 flex max-h-none max-w-none items-center justify-center border-0 bg-transparent p-0 animate-in fade-in duration-200"
    >
      {/* Backdrop — tabIndex={-1} keeps it out of tab order while still being clickable */}
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close image viewer"
        className="absolute inset-0 bg-black/80 backdrop-blur-sm cursor-default"
        onClick={onClose}
      />
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute top-4 right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
      >
        <X className="h-5 w-5" />
      </button>
      <img
        src={src}
        alt="Full size"
        className="relative z-10 max-w-[90vw] max-h-[90vh] rounded-lg object-contain shadow-2xl animate-in zoom-in-95 duration-200"
      />
    </dialog>
  )
}
