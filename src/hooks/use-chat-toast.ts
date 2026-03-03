import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { toast } from 'sonner'
import type { ChatEventPayload } from '@/lib/gateway/types'
import { createLogger } from '@/lib/logger'
import { selectClient, selectIsConnected, useGatewayStore } from '@/stores/gateway-store'

const log = createLogger('chat-toast')
const DISMISS_MS = 6_000

function extractPreview(payload: ChatEventPayload): string | null {
  const content = payload.message?.content
  if (!Array.isArray(content)) return null

  for (const c of content) {
    if ('text' in c && typeof c.text === 'string' && c.text.trim()) {
      const text = c.text.trim()
      return text.length > 120 ? `${text.slice(0, 117)}…` : text
    }
  }
  return null
}

function resolveAgent(sessionKey: string): string {
  const parts = sessionKey.split(':')
  return parts[0] || 'Agent'
}

/** Shows a toast when a chat message arrives while the user is not on `/chat`. */
export function useChatToast() {
  const client = useGatewayStore(selectClient)
  const connected = useGatewayStore(selectIsConnected)
  const location = useLocation()
  const navigate = useNavigate()
  const locationRef = useRef(location.pathname)

  // Keep pathname ref fresh without re-subscribing the WS listener
  useEffect(() => {
    locationRef.current = location.pathname
  }, [location.pathname])

  useEffect(() => {
    if (!client || !connected) return

    const unsub = client.on('chat', (raw) => {
      if (locationRef.current === '/chat') return

      const payload = raw as ChatEventPayload
      if (payload.state !== 'final') return

      const preview = extractPreview(payload)
      if (!preview) return

      const agent = resolveAgent(payload.sessionKey)

      toast(agent, {
        description: preview,
        duration: DISMISS_MS,
        action: {
          label: 'Open',
          onClick: () => {
            void navigate('/chat')
          },
        },
      })

      log.debug('Chat toast shown', { agent, sessionKey: payload.sessionKey })
    })

    return unsub
  }, [client, connected, navigate])
}
