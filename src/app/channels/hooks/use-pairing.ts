import { useCallback, useEffect, useRef, useState } from 'react'
import { createLogger } from '@/lib/logger'
import { selectClient, selectIsConnected, useGatewayStore } from '@/stores/gateway-store'
import type { DevicePairingList, DevicePendingRequest, PairedDevice } from '../types'

const log = createLogger('pairing')
const POLL_MS = 15_000

export function usePairing() {
  const client = useGatewayStore(selectClient)
  const connected = useGatewayStore(selectIsConnected)
  const [pending, setPending] = useState<DevicePendingRequest[]>([])
  const [paired, setPaired] = useState<PairedDevice[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const refresh = useCallback(async () => {
    if (!client?.connected) return
    try {
      const result = await client.request<DevicePairingList>('device.pair.list', {})
      setPending(result.pending ?? [])
      setPaired(result.paired ?? [])
    } catch (err) {
      log.warn('Pairing list fetch failed', err)
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

  const approve = useCallback(
    async (requestId: string) => {
      if (!client?.connected) return
      setBusy(requestId)
      try {
        await client.request('device.pair.approve', { requestId })
        await refresh()
      } catch (err) {
        log.error('Device approve failed', err)
        throw err
      } finally {
        setBusy(null)
      }
    },
    [client, refresh],
  )

  const reject = useCallback(
    async (requestId: string) => {
      if (!client?.connected) return
      setBusy(requestId)
      try {
        await client.request('device.pair.reject', { requestId })
        await refresh()
      } catch (err) {
        log.error('Device reject failed', err)
        throw err
      } finally {
        setBusy(null)
      }
    },
    [client, refresh],
  )

  const remove = useCallback(
    async (deviceId: string) => {
      if (!client?.connected) return
      setBusy(deviceId)
      try {
        await client.request('device.pair.remove', { deviceId })
        await refresh()
      } catch (err) {
        log.error('Device remove failed', err)
        throw err
      } finally {
        setBusy(null)
      }
    },
    [client, refresh],
  )

  return { pending, paired, busy, refresh, approve, reject, remove }
}
