import { QrCode } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { GatewayClient } from '@/lib/gateway/client'
import { createLogger } from '@/lib/logger'
import type { QrLoginStartResult, QrLoginWaitResult } from '../types'

const log = createLogger('qr-login')
const WAIT_TIMEOUT_MS = 120_000

type Props = {
  readonly label: string
  readonly client: GatewayClient | null
  readonly onRefresh: () => void
}

type QrState = 'idle' | 'loading' | 'scanning' | 'success' | 'error'

export function QrLoginDialog({ label, client, onRefresh }: Props) {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<QrState>('idle')
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const abortRef = useRef(false)

  const reset = () => {
    setState('idle')
    setQrUrl(null)
    setErrorMsg(null)
    abortRef.current = false
  }

  const startLogin = useCallback(async () => {
    if (!client?.connected) return
    abortRef.current = false
    setState('loading')
    setErrorMsg(null)

    try {
      const result = await client.request<QrLoginStartResult>('web.login.start', {
        force: true,
      })

      if (abortRef.current) return

      if (result.qrDataUrl) {
        setQrUrl(result.qrDataUrl)
        setState('scanning')

        const waitResult = await client.request<QrLoginWaitResult>('web.login.wait', {
          timeoutMs: WAIT_TIMEOUT_MS,
        })

        if (abortRef.current) return

        if (waitResult.connected) {
          setState('success')
          toast.success(`${label} connected`)
          onRefresh()
          setTimeout(() => setOpen(false), 1500)
        } else {
          setState('error')
          setErrorMsg(waitResult.message ?? 'QR scan timed out')
        }
      } else {
        setState('error')
        setErrorMsg(result.message ?? 'Failed to generate QR code')
      }
    } catch (err) {
      if (abortRef.current) return
      setState('error')
      const msg = err instanceof Error ? err.message : 'Login failed'
      setErrorMsg(msg)
      log.error('QR login failed', err)
    }
  }, [client, label, onRefresh])

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      abortRef.current = true
      reset()
    }
    setOpen(next)
  }

  return (
    <>
      <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => setOpen(true)}>
        <QrCode className="h-3 w-3" />
        Connect via QR
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Connect {label}</DialogTitle>
            <DialogDescription>Scan the QR code with your {label} app to link this device.</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-4 py-4">
            {state === 'idle' && (
              <Button onClick={() => void startLogin()} className="gap-1.5">
                <QrCode className="h-4 w-4" />
                Generate QR Code
              </Button>
            )}

            {state === 'loading' && (
              <div className="flex flex-col items-center gap-2">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <span className="text-xs text-muted-foreground">Generating QR code…</span>
              </div>
            )}

            {state === 'scanning' && qrUrl && (
              <div className="flex flex-col items-center gap-3">
                <img src={qrUrl} alt="QR Code" className="h-48 w-48 rounded-lg" />
                <span className="text-xs text-muted-foreground">Waiting for scan… (2 min timeout)</span>
              </div>
            )}

            {state === 'success' && (
              <div className="flex flex-col items-center gap-2 text-success">
                <span className="text-2xl">✓</span>
                <span className="text-sm font-medium">Connected</span>
              </div>
            )}

            {state === 'error' && (
              <div className="flex flex-col items-center gap-2">
                <span className="text-xs text-destructive">{errorMsg}</span>
                <Button variant="outline" size="sm" onClick={() => void startLogin()}>
                  Retry
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
