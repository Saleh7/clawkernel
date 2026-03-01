import { Send, Timer } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { GatewayClient } from '@/lib/gateway/client'
import type { GatewaySessionRow } from '@/lib/gateway/types'
import { createLogger } from '@/lib/logger'
import { useSessionDialogClient } from './use-session-dialog-client'

interface SendMessageDialogProps {
  session: GatewaySessionRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Optional — if omitted, falls back to the gateway store client */
  client?: GatewayClient | null
}

const log = createLogger('sessions:send-dialog')

export function SendMessageDialog({ open, onOpenChange, session, client: clientProp }: SendMessageDialogProps) {
  const client = useSessionDialogClient(clientProp)

  const [message, setMessage] = useState('')
  const [role, setRole] = useState<'user' | 'assistant'>('user')
  const [sending, setSending] = useState(false)

  const handleClose = (o: boolean) => {
    if (!o) {
      setMessage('')
      setRole('user')
    }
    onOpenChange(o)
  }

  const handleSend = async () => {
    if (!client?.connected || !session || !message.trim()) return
    setSending(true)
    try {
      await client.request('chat.inject', {
        sessionKey: session.key,
        role,
        content: message.trim(),
      })
      setMessage('')
      onOpenChange(false)
    } catch (err) {
      log.warn('chat.inject failed', err, { sessionKey: session.key, role })
      toast.error('Failed to inject message')
    }
    setSending(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Send className="h-4 w-4 text-primary" />
            Inject Message
          </DialogTitle>
          <DialogDescription className="font-mono text-xs text-muted-foreground">{session?.key}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Role</Label>
            <div className="flex gap-1">
              {(['user', 'assistant'] as const).map((r) => (
                <Button
                  key={r}
                  size="sm"
                  variant={role === r ? 'default' : 'outline'}
                  className="text-xs flex-1 capitalize"
                  onClick={() => setRole(r)}
                >
                  {r}
                </Button>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs">Message</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={`Type a message to inject as ${role}...`}
              className="mt-1.5 min-h-[100px] resize-y"
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!message.trim() || sending}
              onClick={() => void handleSend()}
              className="gap-1.5"
            >
              {sending ? <Timer className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              {sending ? 'Injecting...' : `Inject as ${role}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
