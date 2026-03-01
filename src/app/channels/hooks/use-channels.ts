import { useCallback, useEffect, useRef } from 'react'
import type { ChannelsStatusSnapshot, ConfigSnapshot } from '@/lib/gateway/types'
import { createLogger } from '@/lib/logger'
import { selectClient, selectIsConnected, useGatewayStore } from '@/stores/gateway-store'

const log = createLogger('channels')
const POLL_MS = 30_000

export function useChannels() {
  const client = useGatewayStore(selectClient)
  const connected = useGatewayStore(selectIsConnected)
  const channels = useGatewayStore((s) => s.channels)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const refresh = useCallback(async () => {
    if (!client?.connected) return
    try {
      const [channelsResult, configResult] = await Promise.all([
        client.request<ChannelsStatusSnapshot>('channels.status', {}),
        !useGatewayStore.getState().config ? client.request<ConfigSnapshot>('config.get', {}) : null,
      ])
      if (channelsResult) useGatewayStore.setState({ channels: channelsResult })
      if (configResult) useGatewayStore.getState().setConfig(configResult)
    } catch (err) {
      log.warn('Channel status refresh failed', err)
    }
  }, [client])

  useEffect(() => {
    if (!connected) return
    refresh()

    timerRef.current = setInterval(() => {
      if (!document.hidden) refresh()
    }, POLL_MS)

    const onVisibility = () => {
      if (!document.hidden) refresh()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [connected, refresh])

  return { channels, refresh }
}
