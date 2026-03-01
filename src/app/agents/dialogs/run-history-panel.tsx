import { ChevronDown, ChevronUp, History } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import type { GatewayClient } from '@/lib/gateway/client'
import type { CronRunLogEntry } from '@/lib/gateway/types'
import { cn } from '@/lib/utils'
import { formatDuration, log } from '../cron-utils'

export function RunHistoryPanel({ jobId, client }: { jobId: string; client: GatewayClient | null }) {
  const [runs, setRuns] = useState<CronRunLogEntry[] | null>(null)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const fetchRuns = useCallback(async () => {
    if (!client) return
    setLoading(true)
    try {
      const res = await client.request<{ runs: CronRunLogEntry[] }>('cron.runs', { jobId, limit: 20 })
      setRuns(res.runs)
    } catch (err) {
      log.warn('Cron runs fetch failed', err)
      setRuns([])
    }
    setLoading(false)
  }, [client, jobId])

  useEffect(() => {
    if (open && runs === null) fetchRuns()
  }, [open, runs, fetchRuns])

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
      >
        <History className="h-3 w-3" />
        Run History
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>
      {open && (
        <div className="mt-2 space-y-1.5 max-h-40 overflow-y-auto">
          {loading && <Skeleton className="h-6 w-full" />}
          {runs && runs.length === 0 && <p className="text-[10px] text-muted-foreground/40">No runs yet</p>}
          {runs?.map((r, i) => (
            <div
              key={i}
              className="flex items-center gap-2 text-[10px] text-muted-foreground px-2 py-1 rounded-lg bg-muted/20"
            >
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full shrink-0',
                  r.status === 'ok'
                    ? 'bg-green-500'
                    : r.status === 'error'
                      ? 'bg-destructive'
                      : 'bg-muted-foreground/40',
                )}
              />
              <span className="font-mono">{r.status ?? '—'}</span>
              <span className="text-muted-foreground/50">{new Date(r.ts).toLocaleString()}</span>
              {r.durationMs != null && (
                <span className="font-mono text-muted-foreground/40">{formatDuration(r.durationMs)}</span>
              )}
              {r.summary && <span className="truncate text-muted-foreground/60">{r.summary}</span>}
              {r.error && <span className="truncate text-destructive/70">{r.error}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
