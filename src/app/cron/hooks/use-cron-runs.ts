import { useCallback, useRef, useState } from 'react'
import type { GatewayClient } from '@/lib/gateway/client'
import type { CronRunLogEntry, CronRunsResult } from '@/lib/gateway/types'
import { createLogger } from '@/lib/logger'

const log = createLogger('cron:runs')
const PAGE_SIZE = 20

export function useCronRuns(client: GatewayClient | null) {
  const [runs, setRuns] = useState<CronRunLogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const activeJobId = useRef<string | null>(null)
  const offsetRef = useRef(0)

  const fetchRuns = useCallback(
    async (jobId: string, append = false) => {
      if (!client) return
      activeJobId.current = jobId
      const offset = append ? offsetRef.current : 0
      if (append) setLoadingMore(true)
      else setLoading(true)

      try {
        const res = await client.request<CronRunsResult>('cron.runs', {
          scope: 'job',
          id: jobId,
          limit: PAGE_SIZE,
          offset,
          sortDir: 'desc',
        })
        const entries = res.entries ?? []
        if (activeJobId.current !== jobId) return
        setRuns((prev) => (append ? [...prev, ...entries] : entries))
        setTotal(res.total ?? entries.length)
        setHasMore(res.hasMore ?? false)
        offsetRef.current = res.nextOffset ?? offset + entries.length
      } catch (err) {
        log.warn('cron.runs failed', err)
      } finally {
        if (append) setLoadingMore(false)
        else setLoading(false)
      }
    },
    [client],
  )

  const loadMore = useCallback(() => {
    if (!activeJobId.current || !hasMore || loadingMore) return
    void fetchRuns(activeJobId.current, true)
  }, [hasMore, loadingMore, fetchRuns])

  const clear = useCallback(() => {
    setRuns([])
    setTotal(0)
    setHasMore(false)
    activeJobId.current = null
    offsetRef.current = 0
  }, [])

  return { runs, total, hasMore, loading, loadingMore, fetchRuns, loadMore, clear }
}
