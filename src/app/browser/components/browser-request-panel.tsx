import { CheckCircle2, CircleX, Clock, History, SendHorizonal } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { SendResult } from '../hooks/use-browser'
import type { HistoryEntry, RequestMethod } from '../types'

const METHOD_COLORS: Record<RequestMethod, string> = {
  GET: 'text-emerald-400',
  POST: 'text-sky-400',
  DELETE: 'text-red-400',
}

const PATH_PRESETS = [
  { method: 'GET' as RequestMethod, path: '/', label: 'Status' },
  { method: 'GET' as RequestMethod, path: '/profiles', label: 'Profiles' },
  { method: 'GET' as RequestMethod, path: '/tabs', label: 'Tabs' },
  { method: 'POST' as RequestMethod, path: '/start', label: 'Start' },
  { method: 'POST' as RequestMethod, path: '/stop', label: 'Stop' },
  { method: 'POST' as RequestMethod, path: '/tabs/open', label: 'Open tab' },
]

type Props = {
  readonly sending: boolean
  readonly lastResult: SendResult | null
  readonly history: HistoryEntry[]
  readonly onSend: (params: { method: RequestMethod; path: string; query: string; body: string }) => Promise<SendResult>
}

function formatBody(body: unknown): string {
  if (body === undefined || body === null) return ''
  if (typeof body === 'string') return body
  try {
    return JSON.stringify(body, null, 2)
  } catch {
    if (typeof body === 'number' || typeof body === 'boolean' || typeof body === 'bigint') {
      return `${body}`
    }
    return '[unserializable payload]'
  }
}

export function BrowserRequestPanel({ sending, lastResult, history, onSend }: Props) {
  const [method, setMethod] = useState<RequestMethod>('GET')
  const [path, setPath] = useState('/')
  const [query, setQuery] = useState('')
  const [body, setBody] = useState('')

  const applyPreset = (preset: { method: RequestMethod; path: string }) => {
    setMethod(preset.method)
    setPath(preset.path)
    if (preset.method === 'GET') setBody('')
  }

  const applyHistory = (entry: HistoryEntry) => {
    setMethod(entry.method)
    setPath(entry.path)
    setBody('')
    setQuery('')
  }

  const handleSend = async () => {
    await onSend({ method, path, query, body })
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Request Panel */}
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <p className="text-sm font-semibold">Request Panel</p>

        {/* Presets */}
        <div className="flex flex-wrap gap-1.5">
          {PATH_PRESETS.map((p) => (
            <button
              key={`${p.method}:${p.path}`}
              type="button"
              onClick={() => applyPreset(p)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md border border-border bg-muted px-2 py-0.5 text-xs hover:bg-accent transition-colors',
                method === p.method && path === p.path && 'border-primary/40 bg-primary/10',
              )}
            >
              <span className={cn('font-mono font-semibold', METHOD_COLORS[p.method])}>{p.method}</span>
              <span className="text-muted-foreground">{p.label}</span>
            </button>
          ))}
        </div>

        {/* Method + Path */}
        <div className="flex items-center gap-2">
          <select
            value={method}
            onChange={(e) => {
              setMethod(e.target.value as RequestMethod)
              if (e.target.value === 'GET') setBody('')
            }}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm font-mono font-semibold outline-none focus:border-ring shrink-0"
            aria-label="HTTP method"
          >
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="DELETE">DELETE</option>
          </select>
          <input
            type="text"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="/path"
            className="flex-1 min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm font-mono outline-none focus:border-ring"
            aria-label="Request path"
            onKeyDown={(e) => e.key === 'Enter' && void handleSend()}
          />
          <Button onClick={handleSend} disabled={sending || !path.trim()} className="gap-1.5 shrink-0">
            <SendHorizonal className="h-3.5 w-3.5" />
            {sending ? 'Sending…' : 'Send'}
          </Button>
        </div>

        {/* Query */}
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Query Params <span className="font-normal normal-case">(JSON, optional)</span>
          </p>
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            rows={2}
            placeholder='{ "profile": "default" }'
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono outline-none focus:border-ring resize-none"
            aria-label="Query params JSON"
          />
        </div>

        {/* Body (POST only) */}
        {method !== 'GET' && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Body <span className="font-normal normal-case">(JSON, optional)</span>
            </p>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              placeholder='{ "url": "https://example.com" }'
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono outline-none focus:border-ring resize-none"
              aria-label="Request body JSON"
            />
          </div>
        )}
      </div>

      {/* Response Viewer */}
      {lastResult !== null && (
        <div
          className={cn(
            'rounded-xl border p-5 space-y-3',
            lastResult.ok ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5',
          )}
        >
          <div className="flex items-center gap-2">
            {lastResult.ok ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            ) : (
              <CircleX className="h-4 w-4 text-red-400" />
            )}
            <p className={cn('text-sm font-semibold', lastResult.ok ? 'text-emerald-300' : 'text-red-300')}>
              {lastResult.ok ? '200 OK' : 'Error'}
            </p>
          </div>
          <pre className="max-h-72 overflow-auto rounded-lg border border-border bg-muted px-4 py-3 text-xs font-mono text-foreground/80 whitespace-pre-wrap break-all">
            {lastResult.ok ? formatBody(lastResult.body) || '(empty response)' : lastResult.errorMessage}
          </pre>
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-semibold">History</p>
            <span className="text-xs text-muted-foreground">({history.length} / 20)</span>
          </div>
          <div className="flex flex-col gap-1">
            {history.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => applyHistory(entry)}
                className="flex items-center gap-3 rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-left hover:bg-accent/30 transition-colors"
                title="Click to restore into request panel"
              >
                <span className={cn('text-xs font-mono font-semibold w-14 shrink-0', METHOD_COLORS[entry.method])}>
                  {entry.method}
                </span>
                <span className="flex-1 min-w-0 text-xs font-mono text-foreground/80 truncate">{entry.path}</span>
                <span className={cn('text-xs font-semibold shrink-0', entry.ok ? 'text-emerald-400' : 'text-red-400')}>
                  {entry.ok ? '200' : 'ERR'}
                </span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                  <Clock className="h-3 w-3" />
                  {entry.durationMs}ms
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
