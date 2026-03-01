// ---------------------------------------------------------------------------
//  Agent Overview — QuickActions & DangerZone panels
// ---------------------------------------------------------------------------

import { AlertTriangle, Copy, RefreshCw, Send, Star, Trash2 } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { SendMessageDialog } from '@/components/session-dialogs'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import type { GatewayClient } from '@/lib/gateway/client'
import type { AgentsListResult, ConfigSnapshot, GatewaySessionRow } from '@/lib/gateway/types'
import { createLogger } from '@/lib/logger'
import { deleteSession, refreshSessions } from '@/lib/session-ops'
import { useGatewayStore } from '@/stores/gateway-store'
import { saveRawConfigWithRetry } from '../config-utils'

const log = createLogger('agents:overview')

// ---------------------------------------------------------------------------
//  Shared helper — clear all sessions for an agent
// ---------------------------------------------------------------------------

async function clearAgentSessions(client: GatewayClient, agentSessions: { key: string }[]): Promise<void> {
  for (const s of agentSessions) {
    await deleteSession(client, s.key)
  }
  await refreshSessions(client)
}

// ---------------------------------------------------------------------------
//  DangerRow — local layout primitive for DangerZone action rows
// ---------------------------------------------------------------------------

function DangerRow({
  label,
  description,
  action,
}: {
  label: string
  description: React.ReactNode
  action: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-xs font-medium text-foreground">{label}</p>
        <p className="text-[10px] text-muted-foreground/60">{description}</p>
      </div>
      {action}
    </div>
  )
}

// ---------------------------------------------------------------------------
//  QuickActions
// ---------------------------------------------------------------------------

export function QuickActions({
  agentId,
  isDefault,
  client,
  config,
  agentSessions,
}: {
  agentId: string
  isDefault: boolean
  client: GatewayClient | null
  config: ConfigSnapshot | null
  agentSessions: GatewaySessionRow[]
}) {
  const [settingDefault, setSettingDefault] = useState(false)
  const [clearingSessions, setClearingSessions] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [sendSession, setSendSession] = useState<GatewaySessionRow | null>(null)

  const mainSession = useMemo(
    () => agentSessions.find((s) => s.kind === 'direct' && !s.key.includes(':subagent:')) ?? null,
    [agentSessions],
  )

  const setAsDefault = useCallback(async () => {
    if (!client?.connected || !config || isDefault) return
    setSettingDefault(true)
    try {
      const fresh = await saveRawConfigWithRetry(client, config, (current) => {
        const agents = (current.agents ?? {}) as Record<string, unknown>
        return { ...current, agents: { ...agents, default: agentId } }
      })
      useGatewayStore.getState().setConfig(fresh)
      const al = await client.request<AgentsListResult>('agents.list', {})
      useGatewayStore.getState().setAgents(al)
    } catch (err) {
      log.warn('Set default agent failed', err)
      toast.error('Failed to set default agent')
    }
    setSettingDefault(false)
  }, [client, config, agentId, isDefault])

  const clearSessions = useCallback(async () => {
    if (!client?.connected) return
    setClearingSessions(true)
    try {
      await clearAgentSessions(client, agentSessions)
    } catch (err) {
      log.warn('Clear sessions failed', err)
      toast.error('Failed to clear sessions')
    }
    setClearingSessions(false)
    setShowClearConfirm(false)
  }, [client, agentSessions])

  return (
    <>
      <div className="rounded-xl border border-border/40 bg-background/50 p-4">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/60">
          Quick Actions
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 rounded-lg text-xs"
            disabled={isDefault || settingDefault}
            onClick={() => void setAsDefault()}
          >
            {settingDefault ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Star className="h-3 w-3" />}
            {isDefault ? 'Default Agent' : 'Set as Default'}
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 rounded-lg text-xs"
            disabled={!mainSession}
            onClick={() => setSendSession(mainSession)}
          >
            <Send className="h-3 w-3" />
            Send Message
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 rounded-lg text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={agentSessions.length === 0}
            onClick={() => setShowClearConfirm(true)}
          >
            <Trash2 className="h-3 w-3" />
            Clear Sessions ({agentSessions.length})
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 rounded-lg text-xs"
            onClick={() => {
              navigator.clipboard.writeText(agentId).catch((err) => log.warn('Clipboard write failed', err))
            }}
          >
            <Copy className="h-3 w-3" />
            Copy ID
          </Button>
        </div>
      </div>

      {/* Send Message Dialog */}
      <SendMessageDialog
        session={sendSession}
        open={!!sendSession}
        onOpenChange={(v) => !v && setSendSession(null)}
        client={client}
      />

      {/* Clear Sessions Confirm */}
      <ConfirmDialog
        open={showClearConfirm}
        onOpenChange={setShowClearConfirm}
        title="Clear All Sessions"
        description={
          <>
            This will permanently delete <span className="font-semibold">{agentSessions.length}</span> sessions and
            their transcripts for agent <span className="font-mono font-semibold">{agentId}</span>.
          </>
        }
        confirmText={agentId}
        actionLabel={`Delete ${agentSessions.length} Sessions`}
        loadingLabel="Clearing…"
        loading={clearingSessions}
        onConfirm={clearSessions}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
//  DangerZone
// ---------------------------------------------------------------------------

export function DangerZone({
  agentId,
  isDefault,
  client,
  agentSessions,
  deleteSlot,
}: {
  agentId: string
  isDefault: boolean
  client: GatewayClient | null
  agentSessions: GatewaySessionRow[]
  deleteSlot?: React.ReactNode
}) {
  const [clearingSessions, setClearingSessions] = useState(false)
  const [resettingWorkspace, setResettingWorkspace] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)

  const clearAllSessions = useCallback(async () => {
    if (!client?.connected) return
    setClearingSessions(true)
    try {
      await clearAgentSessions(client, agentSessions)
    } catch (err) {
      log.warn('Clear sessions failed', err)
      toast.error('Failed to clear sessions')
    }
    setClearingSessions(false)
    setShowClearConfirm(false)
  }, [client, agentSessions])

  const resetWorkspaceFiles = useCallback(async () => {
    if (!client?.connected) return
    setResettingWorkspace(true)
    try {
      const coreFiles = ['MEMORY.md', 'HEARTBEAT.md']
      for (const name of coreFiles) {
        await client.request('agents.files.set', { agentId, name, content: '' }).catch((err) => {
          log.error('File create failed', err)
          toast.error('Failed to create file')
        })
      }
    } catch (err) {
      log.warn('Reset workspace files failed', err)
      toast.error('Failed to reset workspace files')
    }
    setResettingWorkspace(false)
    setShowResetConfirm(false)
  }, [client, agentId])

  return (
    <div className="rounded-xl border border-destructive/20 bg-destructive/[0.02] p-5 space-y-4">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-destructive" />
        <h3 className="text-sm font-semibold tracking-tight text-destructive">Danger Zone</h3>
      </div>

      <Separator className="opacity-20" />

      <div className="space-y-3">
        <DangerRow
          label="Clear All Sessions"
          description={`Delete ${agentSessions.length} sessions and their transcripts`}
          action={
            <Button
              size="sm"
              variant="outline"
              className="h-7 shrink-0 gap-1.5 rounded-lg text-[11px] border-destructive/30 text-destructive hover:bg-destructive/10"
              disabled={agentSessions.length === 0}
              onClick={() => setShowClearConfirm(true)}
            >
              <Trash2 className="h-3 w-3" />
              Clear Sessions
            </Button>
          }
        />

        <DangerRow
          label="Reset Memory Files"
          description="Clear MEMORY.md and HEARTBEAT.md contents"
          action={
            <Button
              size="sm"
              variant="outline"
              className="h-7 shrink-0 gap-1.5 rounded-lg text-[11px] border-destructive/30 text-destructive hover:bg-destructive/10"
              onClick={() => setShowResetConfirm(true)}
            >
              <RefreshCw className="h-3 w-3" />
              Reset Memory
            </Button>
          }
        />

        <DangerRow
          label="Delete Agent"
          description={isDefault ? 'Cannot delete the default agent' : 'Permanently remove this agent and its bindings'}
          action={deleteSlot}
        />
      </div>

      {/* Clear Sessions Confirm */}
      <ConfirmDialog
        open={showClearConfirm}
        onOpenChange={setShowClearConfirm}
        title="Clear All Sessions"
        description={
          <>
            Permanently delete <span className="font-semibold">{agentSessions.length}</span> sessions and their
            transcripts for <span className="font-mono font-semibold">{agentId}</span>. This cannot be undone.
          </>
        }
        confirmText={agentId}
        actionLabel={`Delete ${agentSessions.length} Sessions`}
        loadingLabel="Clearing…"
        loading={clearingSessions}
        onConfirm={clearAllSessions}
      />

      {/* Reset Workspace Confirm */}
      <ConfirmDialog
        open={showResetConfirm}
        onOpenChange={setShowResetConfirm}
        title="Reset Memory Files"
        description={
          <>
            This will clear the contents of MEMORY.md and HEARTBEAT.md for{' '}
            <span className="font-mono font-semibold">{agentId}</span>.
          </>
        }
        confirmText="reset"
        actionLabel="Reset Memory"
        loadingLabel="Resetting…"
        loading={resettingWorkspace}
        onConfirm={resetWorkspaceFiles}
      />
    </div>
  )
}
