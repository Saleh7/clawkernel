import { useCallback, useEffect, useRef, useState } from 'react'
import type { GatewayClient } from '@/lib/gateway/client'
import type {
  CronJob,
  CronJobsEnabledFilter,
  CronJobsListResult,
  CronJobsSortBy,
  CronSortDir,
  CronStatus,
} from '@/lib/gateway/types'
import { createLogger } from '@/lib/logger'
import { useGatewayStore } from '@/stores/gateway-store'

const log = createLogger('cron:jobs')
const POLL_INTERVAL = 30_000
const PAGE_SIZE = 50

export function useCronJobs() {
  const client = useGatewayStore((s) => s.client)
  const connected = useGatewayStore((s) => s.state === 'connected')
  const storeStatus = useGatewayStore((s) => s.cronStatus)

  const [jobs, setJobs] = useState<CronJob[]>([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [status, setStatus] = useState<CronStatus | null>(storeStatus)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  const [query, setQuery] = useState('')
  const [enabledFilter, setEnabledFilter] = useState<CronJobsEnabledFilter>('all')
  const [sortBy, setSortBy] = useState<CronJobsSortBy>('nextRunAtMs')
  const [sortDir, setSortDir] = useState<CronSortDir>('asc')

  const offsetRef = useRef(0)

  const fetchJobs = useCallback(
    async (c: GatewayClient, append: boolean) => {
      const offset = append ? offsetRef.current : 0
      if (append) setLoadingMore(true)
      else setLoading(true)

      try {
        const res = await c.request<CronJobsListResult>('cron.list', {
          enabled: enabledFilter,
          limit: PAGE_SIZE,
          offset,
          query: query.trim() || undefined,
          sortBy,
          sortDir,
        })
        const list = res.jobs ?? []
        setJobs((prev) => (append ? [...prev, ...list] : list))
        setTotal(res.total ?? list.length)
        setHasMore(res.hasMore ?? false)
        offsetRef.current = res.nextOffset ?? offset + list.length
      } catch (err) {
        log.warn('cron.list failed', err)
      }

      if (append) setLoadingMore(false)
      else setLoading(false)
    },
    [enabledFilter, query, sortBy, sortDir],
  )

  const fetchStatus = useCallback(async (c: GatewayClient) => {
    try {
      const res = await c.request<CronStatus>('cron.status', {})
      setStatus(res)
    } catch (err) {
      log.warn('cron.status failed', err)
    }
  }, [])

  const refresh = useCallback(() => {
    if (!client || !connected) return
    void fetchJobs(client, false)
    void fetchStatus(client)
  }, [client, connected, fetchJobs, fetchStatus])

  const loadMore = useCallback(() => {
    if (!client || !connected || !hasMore || loadingMore) return
    void fetchJobs(client, true)
  }, [client, connected, hasMore, loadingMore, fetchJobs])

  useEffect(() => {
    if (!client || !connected) return
    void fetchJobs(client, false)
    void fetchStatus(client)
  }, [client, connected, fetchJobs, fetchStatus])

  useEffect(() => {
    if (!client || !connected) return
    const id = setInterval(() => {
      void fetchJobs(client, false)
      void fetchStatus(client)
    }, POLL_INTERVAL)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void fetchJobs(client, false)
        void fetchStatus(client)
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [client, connected, fetchJobs, fetchStatus])

  return {
    jobs,
    total,
    hasMore,
    status,
    loading,
    loadingMore,
    query,
    enabledFilter,
    sortBy,
    sortDir,
    setQuery,
    setEnabledFilter,
    setSortBy,
    setSortDir,
    refresh,
    loadMore,
    client,
  }
}
