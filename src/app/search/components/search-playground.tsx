import { AlertTriangle, Copy, Play, Search, Square } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { extractAgentId } from '@/app/sessions/utils'
import { Markdown } from '@/components/prompt-kit/markdown'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { GatewayAgentRow, GatewaySessionRow } from '@/lib/gateway/types'
import { createLogger } from '@/lib/logger'
import { cn } from '@/lib/utils'
import { useGatewayStore } from '@/stores/gateway-store'
import type { PlaygroundState } from '../types'

const log = createLogger('search:playground')

// F7 — result counts matching ROADMAP 6.3 spec (1 / 3 / 5 / 10)
const RESULT_COUNTS = [1, 3, 5, 10] as const

// F9 — stable empty array; avoids new reference on every store update when agents is null
const EMPTY_AGENTS: GatewayAgentRow[] = []

function getSessionLabel(s: GatewaySessionRow): string {
  return s.displayName || s.label || s.key.split(':').pop() || s.key
}

function CommandPreview({ agentId, query }: { readonly agentId: string; readonly query: string }) {
  const [copied, setCopied] = useState(false)
  const command = `openclaw agent --agent ${agentId} --message "web_search: ${query.trim() || '<your query>'}"`

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (err) {
      log.warn('copy failed', err)
    }
  }, [command])

  return (
    <div className="rounded-lg border border-border/40 bg-muted/20 p-2.5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground/70">CLI equivalent</p>
      <div className="mt-1 flex items-start gap-2">
        <code className="min-w-0 flex-1 break-all rounded bg-muted/40 px-2 py-1 text-xs text-foreground/80">
          {command}
        </code>
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border/40 bg-muted/20 px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/40"
        >
          <Copy className="h-3 w-3" />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  )
}

function ResultPanel({ state, agentId }: { readonly state: PlaygroundState; readonly agentId: string }) {
  if (state.status === 'idle') return null

  return (
    <div className="space-y-2">
      {/* Status bar */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {state.status === 'streaming' && (
          <span className="inline-flex items-center gap-1 rounded border border-sky-500/25 bg-sky-500/10 px-1.5 py-0.5 text-sky-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-400" />
            streaming
          </span>
        )}
        {state.status === 'done' && (
          <span className="rounded border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 text-emerald-300">
            completed
          </span>
        )}
        {state.status === 'error' && (
          <span className="rounded border border-red-500/25 bg-red-500/10 px-1.5 py-0.5 text-red-300">error</span>
        )}
        {state.provider && <span>provider: {state.provider}</span>}
        <span>agent: {agentId}</span>
        {state.durationMs != null && <span>duration: {(state.durationMs / 1000).toFixed(1)}s</span>}
      </div>

      {/* Error message */}
      {state.status === 'error' && state.errorMessage && (
        <div className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {state.errorMessage}
        </div>
      )}

      {/* Result text */}
      {state.text && (
        <div className="max-h-[500px] overflow-auto rounded-lg border border-border/40 bg-background p-4">
          <Markdown>{state.text}</Markdown>
        </div>
      )}
    </div>
  )
}

export function SearchPlayground({
  playgroundState,
  onRun,
  onReset,
  disabled,
  activeProvider,
}: {
  readonly playgroundState: PlaygroundState
  readonly onRun: (params: { sessionKey: string; query: string; resultCount: number; provider: string }) => void
  readonly onReset: () => void
  readonly disabled: boolean
  readonly activeProvider: string
}) {
  const storeAgents = useGatewayStore((s) => s.agents?.agents ?? EMPTY_AGENTS)
  const storeSessions = useGatewayStore((s) => s.sessions)

  const [selectedAgentId, setSelectedAgentId] = useState<string>('')
  const [selectedSessionKey, setSelectedSessionKey] = useState<string>('')
  const [query, setQuery] = useState('')
  const [resultCount, setResultCount] = useState<number>(5)

  // Default agent: first in list
  useEffect(() => {
    if (!selectedAgentId && storeAgents.length > 0) {
      setSelectedAgentId(storeAgents[0].id)
    }
  }, [storeAgents, selectedAgentId])

  // Sessions for selected agent
  const agentSessions = useMemo<GatewaySessionRow[]>(
    () => storeSessions.filter((s) => extractAgentId(s.key) === selectedAgentId),
    [storeSessions, selectedAgentId],
  )

  // Auto-select first session when agent or sessions change
  useEffect(() => {
    if (agentSessions.length > 0) {
      setSelectedSessionKey(agentSessions[0].key)
    } else {
      setSelectedSessionKey('')
    }
  }, [agentSessions])

  const canRun = !disabled && !playgroundState.running && Boolean(query.trim()) && Boolean(selectedSessionKey)

  const handleRun = useCallback(() => {
    if (!canRun) return
    onRun({ sessionKey: selectedSessionKey, query, resultCount, provider: activeProvider })
  }, [canRun, onRun, selectedSessionKey, query, resultCount, activeProvider])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && canRun) handleRun()
    },
    [canRun, handleRun],
  )

  const handleAgentChange = useCallback((id: string) => {
    setSelectedAgentId(id)
    setSelectedSessionKey('')
  }, [])

  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-xs font-semibold text-foreground/90">
          <Search className="h-4 w-4 text-cyan-400" />
          Search Playground
        </h3>
        <span className="rounded border border-cyan-500/25 bg-cyan-500/10 px-2 py-0.5 text-xs font-medium text-cyan-300">
          via chat.send
        </span>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Sends the query to an agent session. The agent uses its <code className="text-xs">web_search</code> tool and
        streams the response back — same as <span className="font-mono text-foreground/60">/chat</span>.
      </p>

      {disabled && (
        <div className="flex items-center gap-1.5 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          No search provider configured — set an API key to enable web search.
        </div>
      )}

      {/* Controls grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Agent */}
        <div className="space-y-1">
          <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground/75">Agent</Label>
          <Select value={selectedAgentId} onValueChange={handleAgentChange} disabled={playgroundState.running}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Select agent" />
            </SelectTrigger>
            <SelectContent>
              {storeAgents.map((a: GatewayAgentRow) => (
                <SelectItem key={a.id} value={a.id} className="text-xs">
                  {a.identity?.name || a.name || a.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Session */}
        <div className="space-y-1">
          <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground/75">Session</Label>
          {agentSessions.length === 0 ? (
            <p className="flex h-8 items-center rounded-md border border-border/40 bg-muted/20 px-2 text-xs text-muted-foreground/60">
              No sessions — open /chat first
            </p>
          ) : (
            <Select value={selectedSessionKey} onValueChange={setSelectedSessionKey} disabled={playgroundState.running}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select session" />
              </SelectTrigger>
              <SelectContent>
                {agentSessions.map((s) => (
                  <SelectItem key={s.key} value={s.key} className="text-xs font-mono">
                    {getSessionLabel(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Query */}
        <div className="space-y-1 sm:col-span-2 lg:col-span-1">
          <Label
            htmlFor="search-query"
            className="text-xs font-medium uppercase tracking-wide text-muted-foreground/75"
          >
            Search query
          </Label>
          <input
            id="search-query"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g. latest React 19 features"
            disabled={playgroundState.running || disabled}
            className={cn(
              'flex h-8 w-full rounded-md border border-border/40 bg-muted/20 px-3 text-xs text-foreground/90',
              'placeholder:text-muted-foreground/50 outline-none',
              'focus:border-cyan-500/40 disabled:opacity-50',
            )}
          />
        </div>

        {/* Results count */}
        <div className="space-y-1">
          <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground/75">Results</Label>
          <Select
            value={String(resultCount)}
            onValueChange={(v) => setResultCount(Number(v))}
            disabled={playgroundState.running}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RESULT_COUNTS.map((n) => (
                <SelectItem key={n} value={String(n)} className="text-xs">
                  {n} results
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* CLI equivalent */}
      <CommandPreview agentId={selectedAgentId || 'main'} query={query} />

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          disabled={!canRun}
          onClick={handleRun}
          className="gap-1.5 bg-cyan-600 text-white hover:bg-cyan-500"
        >
          {playgroundState.running ? (
            <>
              <span className="inline-flex items-center gap-0.5">
                <span className="h-1 w-1 animate-bounce rounded-full bg-current [animation-delay:0ms]" />
                <span className="h-1 w-1 animate-bounce rounded-full bg-current [animation-delay:150ms]" />
                <span className="h-1 w-1 animate-bounce rounded-full bg-current [animation-delay:300ms]" />
              </span>
              Searching…
            </>
          ) : (
            <>
              <Play className="h-3.5 w-3.5" />
              Run Search
            </>
          )}
        </Button>
        {playgroundState.status !== 'idle' && (
          <Button size="sm" variant="outline" onClick={onReset} className="gap-1.5">
            <Square className="h-3 w-3" />
            Clear
          </Button>
        )}
      </div>

      {/* Result panel */}
      <ResultPanel state={playgroundState} agentId={selectedAgentId || 'main'} />
    </div>
  )
}
