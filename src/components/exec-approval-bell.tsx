import { Check, ShieldAlert, XCircle } from 'lucide-react'
import { type Dispatch, type SetStateAction, useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { createLogger } from '@/lib/logger'
import { cn } from '@/lib/utils'
import { selectClient, selectIsConnected, useGatewayStore } from '@/stores/gateway-store'

const log = createLogger('exec-approval')

/**
 * Exec Approval Bell — listens for exec.approval.requested/resolved events
 * and allows the operator to approve/deny tool executions.
 *
 * Source: OpenClaw src/gateway/server-methods/exec-approval.ts:267 (exec.approval.resolve)
 * Params: { id: string, decision: "allow-once" | "allow-always" | "deny" }
 *
 * Events:
 * - exec.approval.requested: { id, request: { command, cwd?, ... }, createdAtMs, expiresAtMs }
 * - exec.approval.resolved:  { id, decision, resolvedBy, ts }
 * Source: OpenClaw ui/src/ui/controllers/exec-approval.ts
 */

type ApprovalRequest = {
  id: string
  command: string
  cwd?: string | null
  agentId?: string | null
  sessionKey?: string | null
  createdAtMs: number
  expiresAtMs: number
}

type Decision = 'allow-once' | 'allow-always' | 'deny'

function parseRequested(payload: unknown): ApprovalRequest | null {
  if (!payload || typeof payload !== 'object') return null
  const p = payload as Record<string, unknown>
  const id = typeof p.id === 'string' ? p.id.trim() : ''
  const request = typeof p.request === 'object' && p.request ? (p.request as Record<string, unknown>) : null
  if (!id || !request) return null
  const command = typeof request.command === 'string' ? request.command.trim() : ''
  if (!command) return null
  const createdAtMs = typeof p.createdAtMs === 'number' ? p.createdAtMs : 0
  const expiresAtMs = typeof p.expiresAtMs === 'number' ? p.expiresAtMs : 0
  if (!createdAtMs || !expiresAtMs) return null
  return {
    id,
    command,
    cwd: typeof request.cwd === 'string' ? request.cwd : null,
    agentId: typeof request.agentId === 'string' ? request.agentId : null,
    sessionKey: typeof request.sessionKey === 'string' ? request.sessionKey : null,
    createdAtMs,
    expiresAtMs,
  }
}

function parseResolved(payload: unknown): { id: string } | null {
  if (!payload || typeof payload !== 'object') return null
  const p = payload as Record<string, unknown>
  const id = typeof p.id === 'string' ? p.id.trim() : ''
  return id ? { id } : null
}

type QueueSetter = Dispatch<SetStateAction<ApprovalRequest[]>>
type ApprovalTimers = Map<string, ReturnType<typeof setTimeout>>

function clearApprovalTimer(id: string, timers: ApprovalTimers): void {
  const timer = timers.get(id)
  if (!timer) return
  clearTimeout(timer)
  timers.delete(id)
}

function removeApprovalEntry(id: string, timers: ApprovalTimers, setQueue: QueueSetter): void {
  setQueue((prev) => prev.filter((entry) => entry.id !== id))
  clearApprovalTimer(id, timers)
}

function scheduleApprovalExpiry(entry: ApprovalRequest, timers: ApprovalTimers, setQueue: QueueSetter): void {
  const delay = Math.max(0, entry.expiresAtMs - Date.now() + 500)
  const timer = setTimeout(() => {
    removeApprovalEntry(entry.id, timers, setQueue)
  }, delay)
  timers.set(entry.id, timer)
}

function trackApprovalRequest(entry: ApprovalRequest, timers: ApprovalTimers, setQueue: QueueSetter): void {
  if (timers.has(entry.id)) return

  let added = false
  setQueue((prev) => {
    if (prev.some((existing) => existing.id === entry.id)) return prev
    added = true
    return [...prev, entry]
  })
  if (!added) return

  scheduleApprovalExpiry(entry, timers, setQueue)
}

function handleApprovalEvent(
  frame: { event: string; payload?: unknown },
  timers: ApprovalTimers,
  setQueue: QueueSetter,
): void {
  if (frame.event === 'exec.approval.requested') {
    const entry = parseRequested(frame.payload)
    if (!entry) return
    trackApprovalRequest(entry, timers, setQueue)
    return
  }

  if (frame.event !== 'exec.approval.resolved') return

  const resolved = parseResolved(frame.payload)
  if (!resolved) return
  removeApprovalEntry(resolved.id, timers, setQueue)
}

function clearAllApprovalTimers(timers: ApprovalTimers): void {
  for (const timer of timers.values()) {
    clearTimeout(timer)
  }
  timers.clear()
}

function getApprovalTitle(count: number): string {
  if (count === 0) return 'Exec Approvals'
  const label = count === 1 ? 'approval' : 'approvals'
  return `${count} pending ${label}`
}

export function ExecApprovalBell() {
  const client = useGatewayStore(selectClient)
  const connected = useGatewayStore(selectIsConnected)
  const [queue, setQueue] = useState<ApprovalRequest[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  // Subscribe to exec.approval.requested / resolved events
  useEffect(() => {
    if (!connected || !client) return

    const unsub = client.on('event', (frame) => {
      handleApprovalEvent(frame, timersRef.current, setQueue)
    })

    return () => {
      unsub()
      clearAllApprovalTimers(timersRef.current)
    }
  }, [connected, client])

  const handleResolve = useCallback(
    async (id: string, decision: Decision) => {
      if (!client?.connected) return
      setBusy(id)
      try {
        await client.request('exec.approval.resolve', { id, decision })
        removeApprovalEntry(id, timersRef.current, setQueue)
        toast.success(`Execution ${decision === 'deny' ? 'denied' : 'approved'}`)
      } catch (err) {
        log.error('exec.approval.resolve failed', err)
        toast.error('Resolve failed')
      } finally {
        setBusy(null)
      }
    },
    [client],
  )

  if (!connected) return null

  const count = queue.length
  const title = getApprovalTitle(count)

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'relative flex items-center justify-center rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground',
            count > 0 && 'text-warning',
          )}
          title={title}
        >
          <ShieldAlert className={cn('h-4 w-4', count > 0 && 'animate-pulse')} />
          {count > 0 && (
            <Badge className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px]">
              {count}
            </Badge>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="px-3 py-2.5 text-sm font-semibold">Exec Approvals</div>
        <Separator />
        {queue.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">No pending approvals</div>
        ) : (
          <div className="max-h-72 overflow-y-auto">
            {queue.map((entry) => (
              <div key={entry.id} className="border-b border-border/50 px-3 py-2.5 last:border-0">
                <div className="mb-1.5 rounded bg-muted/50 px-2 py-1">
                  <code className="block truncate text-[11px]">{entry.command}</code>
                  {entry.cwd && <span className="text-[10px] text-muted-foreground">cwd: {entry.cwd}</span>}
                </div>
                {entry.agentId && <span className="text-[10px] text-muted-foreground">agent: {entry.agentId}</span>}
                <div className="mt-1.5 flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 gap-1 text-[10px] text-success"
                    disabled={busy === entry.id}
                    onClick={() => void handleResolve(entry.id, 'allow-once')}
                  >
                    <Check className="h-3 w-3" />
                    Once
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 gap-1 text-[10px] text-success"
                    disabled={busy === entry.id}
                    onClick={() => void handleResolve(entry.id, 'allow-always')}
                  >
                    <Check className="h-3 w-3" />
                    Always
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 gap-1 text-[10px] text-destructive"
                    disabled={busy === entry.id}
                    onClick={() => void handleResolve(entry.id, 'deny')}
                  >
                    <XCircle className="h-3 w-3" />
                    Deny
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
