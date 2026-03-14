import { ArrowUpCircle, FileEdit, MessageSquare, Zap } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { CreateAgentDialog } from '@/app/agents/dialogs/create-agent-dialog'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { createLogger } from '@/lib/logger'
import { selectClient, selectIsConnected, useGatewayStore } from '@/stores/gateway-store'

const log = createLogger('dashboard:actions')

export function QuickActions() {
  const navigate = useNavigate()
  const client = useGatewayStore(selectClient)
  const connected = useGatewayStore(selectIsConnected)
  const [wakeBusy, setWakeBusy] = useState(false)
  const [updateBusy, setUpdateBusy] = useState(false)
  const [showUpdateConfirm, setShowUpdateConfirm] = useState(false)
  const [openFileBusy, setOpenFileBusy] = useState(false)
  const wakeBusyRef = useRef(false)
  const updateBusyRef = useRef(false)
  const openFileBusyRef = useRef(false)

  // Source: OpenClaw src/gateway/server-methods/cron.ts:25 (wake RPC)
  const handleWake = useCallback(async () => {
    if (!client?.connected || wakeBusyRef.current) return
    wakeBusyRef.current = true
    setWakeBusy(true)
    try {
      await client.request('wake', { mode: 'now', text: 'Manual wake from ClawKernel' })
      toast.success('Wake event sent')
    } catch (err) {
      log.warn('wake failed', err)
      toast.error('Wake failed')
    } finally {
      wakeBusyRef.current = false
      setWakeBusy(false)
    }
  }, [client])

  // Source: OpenClaw src/gateway/server-methods/update.ts:19 (update.run RPC)
  const handleUpdate = useCallback(async () => {
    if (!client?.connected || updateBusyRef.current) return
    updateBusyRef.current = true
    setUpdateBusy(true)
    try {
      const result = await client.request<{ ok: boolean; updated?: boolean; note?: string }>('update.run', {
        note: 'Triggered from ClawKernel dashboard',
        restartDelayMs: 3000,
      })
      if (result.updated) {
        toast.success('Update applied — gateway restarting')
      } else {
        toast.info(result.note ?? 'Already up to date')
      }
    } catch (err) {
      log.warn('update.run failed', err)
      toast.error('Update failed')
    } finally {
      updateBusyRef.current = false
      setUpdateBusy(false)
      setShowUpdateConfirm(false)
    }
  }, [client])

  // Source: OpenClaw src/gateway/server-methods/config.ts (config.openFile RPC)
  const handleOpenConfig = useCallback(async () => {
    if (!client?.connected || openFileBusyRef.current) return
    openFileBusyRef.current = true
    setOpenFileBusy(true)
    try {
      const result = await client.request<{ ok: boolean; path: string; error?: string }>('config.openFile', {})
      if (result.ok) {
        toast.success(`Opened ${result.path}`)
      } else {
        toast.error(result.error ?? 'Failed to open config file')
      }
    } catch (err) {
      log.warn('config.openFile failed', err)
      toast.error('Failed to open config file')
    } finally {
      openFileBusyRef.current = false
      setOpenFileBusy(false)
    }
  }, [client])

  return (
    <div className="flex items-center gap-2">
      <CreateAgentDialog client={client} />
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate('/chat')}>
        <MessageSquare className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Open Chat</span>
      </Button>
      {connected && (
        <>
          <Button variant="outline" size="sm" className="gap-1.5" disabled={wakeBusy} onClick={() => void handleWake()}>
            <Zap className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{wakeBusy ? 'Waking…' : 'Wake'}</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={openFileBusy}
            onClick={() => void handleOpenConfig()}
          >
            <FileEdit className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{openFileBusy ? 'Opening…' : 'Config'}</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={updateBusy}
            onClick={() => setShowUpdateConfirm(true)}
          >
            <ArrowUpCircle className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{updateBusy ? 'Updating…' : 'Update'}</span>
          </Button>
        </>
      )}
      <ConfirmDialog
        open={showUpdateConfirm}
        onOpenChange={setShowUpdateConfirm}
        title="Update Gateway"
        description="This will check for updates and restart the gateway if a new version is available. All active sessions will be interrupted."
        actionLabel="Update & Restart"
        loadingLabel="Updating…"
        variant="destructive"
        loading={updateBusy}
        onConfirm={() => void handleUpdate()}
      />
    </div>
  )
}
