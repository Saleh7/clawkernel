import { History, MessageSquare } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import type { GatewayClient } from '@/lib/gateway/client'
import type { ChatHistoryResult, ChatMessage, GatewaySessionRow } from '@/lib/gateway/types'
import { createLogger } from '@/lib/logger'
import { cn } from '@/lib/utils'
import { useSessionDialogClient } from './use-session-dialog-client'

interface HistoryDialogProps {
  session: GatewaySessionRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Optional — if omitted, falls back to the gateway store client */
  client?: GatewayClient | null
}

const log = createLogger('sessions:history-dialog')

function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function extractText(msg: ChatMessage): string {
  if (!msg.content) return ''
  return msg.content
    .filter((c): c is { type: 'text'; text?: string } => c.type === 'text')
    .map((c) => c.text || '')
    .join('\n')
    .slice(0, 500)
}

export function HistoryDialog({ open, onOpenChange, session, client: clientProp }: HistoryDialogProps) {
  const client = useSessionDialogClient(clientProp)

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !session || !client?.connected) return

    let disposed = false

    const loadHistory = async () => {
      setLoading(true)
      setMessages([])
      setErrorMessage(null)
      try {
        const result = await client.request<ChatHistoryResult>('chat.history', {
          sessionKey: session.key,
          limit: 50,
        })
        if (!disposed) {
          setMessages(result.messages ?? [])
        }
      } catch (err) {
        if (disposed) return
        log.warn('chat.history request failed', err, { sessionKey: session.key })
        setErrorMessage('Failed to load chat history')
        toast.error('Failed to load chat history')
      } finally {
        if (!disposed) {
          setLoading(false)
        }
      }
    }

    void loadHistory()

    return () => {
      disposed = true
    }
  }, [open, session, client])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4 text-primary" />
            Chat History
          </DialogTitle>
          <DialogDescription className="font-mono text-xs text-muted-foreground truncate">
            {session?.key} — last 50 messages
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-[50vh]">
          {loading ? (
            <div className="space-y-3 p-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
          ) : errorMessage ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <MessageSquare className="h-8 w-8 text-destructive/40" />
              <p className="mt-2 text-sm text-destructive">{errorMessage}</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <MessageSquare className="h-8 w-8 text-muted-foreground/20" />
              <p className="mt-2 text-sm text-muted-foreground">No messages in this session</p>
            </div>
          ) : (
            <div className="space-y-2 p-2">
              {messages.map((msg, i) => {
                const text = extractText(msg)
                if (!text && msg.role !== 'tool') return null
                return (
                  <div
                    key={i}
                    className={cn(
                      'rounded-lg border px-3 py-2',
                      msg.role === 'assistant'
                        ? 'border-primary/20 bg-primary/5'
                        : msg.role === 'user'
                          ? 'border-border/40 bg-background/60'
                          : 'border-border/20 bg-muted/30',
                    )}
                  >
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <Badge variant="outline" className="rounded-full px-1.5 py-0 text-[9px] uppercase">
                        {msg.role || 'unknown'}
                      </Badge>
                      {msg.timestamp && <span className="font-mono">{formatTimestamp(msg.timestamp)}</span>}
                    </div>
                    {text && (
                      <p className="mt-1.5 whitespace-pre-wrap text-xs text-foreground/90 leading-relaxed">{text}</p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
