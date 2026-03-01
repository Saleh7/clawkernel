import { useCallback, useEffect, useRef, useState } from 'react'
import { createLogger } from '@/lib/logger'
import { selectClient, selectIsConnected, useGatewayStore } from '@/stores/gateway-store'
import type { CostUsageTotals } from '../types'

const log = createLogger('dashboard')

export function useDashboard() {
  const client = useGatewayStore(selectClient)
  const connected = useGatewayStore(selectIsConnected)
  const [latencyMs, setLatencyMs] = useState<number | null>(null)
  const [todayCost, setTodayCost] = useState<CostUsageTotals | null>(null)
  const mountedRef = useRef(true)

  const fetchData = useCallback(async () => {
    if (!client?.connected) return

    try {
      const t0 = performance.now()
      await client.request('health', {})
      const rtt = Math.round(performance.now() - t0)
      if (mountedRef.current) setLatencyMs(rtt)
    } catch (err) {
      log.warn('Latency probe failed', err)
    }

    try {
      const result = await client.request<{ totals: CostUsageTotals }>('usage.cost', { days: 1 })
      if (mountedRef.current && result?.totals) setTodayCost(result.totals)
    } catch (err) {
      log.warn('Cost fetch failed', err)
    }
  }, [client])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (connected) fetchData()
  }, [connected, fetchData])

  return { latencyMs, todayCost }
}
