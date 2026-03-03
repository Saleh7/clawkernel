// ---------------------------------------------------------------------------
//  Sessions page — state, filtering, sorting, refresh, dialogs
// ---------------------------------------------------------------------------

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { GatewaySessionRow } from '@/lib/gateway/types'
import { createLogger } from '@/lib/logger'
import { ACTIVE_SESSION_MS, STALE_SESSION_MS } from '@/lib/session-constants'
import { refreshSessions } from '@/lib/session-ops'
import {
  selectActiveRuns,
  selectClient,
  selectIsConnected,
  selectSessions,
  useGatewayStore,
} from '@/stores/gateway-store'
import type { KindFilter, QuickFilter, SortDir, SortField, ViewMode } from '../types'
import { buildSessionTree, DISPLAY_PAGE_SIZE, extractAgentId, getDisplayName } from '../utils'

const log = createLogger('sessions:page')
const selectSessionRefreshHint = (s: ReturnType<typeof useGatewayStore.getState>) => s.sessionRefreshHint

export function useSessionsPage() {
  const connected = useGatewayStore(selectIsConnected)
  const sessions = useGatewayStore(selectSessions)
  const client = useGatewayStore(selectClient)
  const activeRuns = useGatewayStore(selectActiveRuns)
  const refreshHint = useGatewayStore(selectSessionRefreshHint)

  // -- Refresh --------------------------------------------------------------
  const [refreshing, setRefreshing] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [gatewayLimit, setGatewayLimit] = useState(500)
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const refreshInFlightRef = useRef(false)
  const wasConnectedRef = useRef(false)
  const gatewayLimitInitializedRef = useRef(false)

  const refresh = useCallback(
    async ({ userInitiated = false }: { userInitiated?: boolean } = {}) => {
      if (!client?.connected || refreshInFlightRef.current) return
      refreshInFlightRef.current = true
      setRefreshing(true)
      try {
        await refreshSessions(client, { limit: gatewayLimit })
      } catch (err) {
        log.warn('sessions.list refresh failed', err, { userInitiated })
        if (userInitiated) toast.error('Failed to refresh sessions')
      } finally {
        refreshInFlightRef.current = false
        setRefreshing(false)
      }
    },
    [client, gatewayLimit],
  )

  useEffect(() => {
    if (connected && !wasConnectedRef.current) void refresh()
    wasConnectedRef.current = connected
  }, [connected, refresh])

  useEffect(() => {
    if (!connected) return
    if (!gatewayLimitInitializedRef.current) {
      gatewayLimitInitializedRef.current = true
      return
    }
    void refresh({ userInitiated: true })
  }, [connected, refresh])

  useEffect(() => {
    if (!autoRefresh || !client?.connected) {
      if (autoRefreshRef.current) clearInterval(autoRefreshRef.current)
      autoRefreshRef.current = null
      return
    }
    autoRefreshRef.current = setInterval(() => void refresh(), 30_000)
    return () => {
      if (autoRefreshRef.current) clearInterval(autoRefreshRef.current)
      autoRefreshRef.current = null
    }
  }, [autoRefresh, client, refresh])

  useEffect(() => {
    if (refreshHint === 0 || !connected) return
    const id = setTimeout(() => void refresh(), 2000)
    return () => clearTimeout(id)
  }, [refreshHint, connected, refresh])

  // -- Filters & sorting ----------------------------------------------------
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [sortField, setSortField] = useState<SortField>('updated')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [kindFilter, setKindFilter] = useState<KindFilter>('all')
  const [agentFilter, setAgentFilter] = useState<string>('all')
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('none')
  const [viewMode, setViewMode] = useState<ViewMode>('flat')
  const [displayLimit, setDisplayLimit] = useState(DISPLAY_PAGE_SIZE)

  // -- Bulk selection -------------------------------------------------------
  const [bulkMode, setBulkMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev
      const keySet = new Set(sessions.map((s) => s.key))
      const next = new Set([...prev].filter((key) => keySet.has(key)))
      return next.size === prev.size ? prev : next
    })
  }, [sessions])

  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [historySession, setHistorySession] = useState<GatewaySessionRow | null>(null)
  const [sendSession, setSendSession] = useState<GatewaySessionRow | null>(null)
  const [patchSession, setPatchSession] = useState<GatewaySessionRow | null>(null)
  const [deleteSession, setDeleteSession] = useState<GatewaySessionRow | null>(null)
  const [showBulkDelete, setShowBulkDelete] = useState(false)

  // -- Derived data ---------------------------------------------------------
  const runningSessionKeys = useMemo(
    () => new Set(Object.values(activeRuns).map((run) => run.sessionKey)),
    [activeRuns],
  )

  const uniqueAgents = useMemo(() => {
    const agents = new Set(sessions.map((s) => extractAgentId(s.key)))
    return Array.from(agents).sort((a, b) => a.localeCompare(b))
  }, [sessions])

  const maxTokens = useMemo(() => sessions.reduce((max, s) => Math.max(max, s.totalTokens ?? 0), 0), [sessions])

  const quickCounts = useMemo(() => {
    let active = 0
    let highUsage = 0
    let stale = 0
    const now = Date.now()
    for (const session of sessions) {
      if (session.updatedAt && now - session.updatedAt < ACTIVE_SESSION_MS) active += 1
      if ((session.totalTokens ?? 0) >= 100_000) highUsage += 1
      if (!session.updatedAt || now - session.updatedAt > STALE_SESSION_MS) stale += 1
    }
    return { all: sessions.length, active, highUsage, stale }
  }, [sessions])

  const indexedSessions = useMemo(
    () =>
      sessions.map((session) => ({
        session,
        keyLower: session.key.toLowerCase(),
        nameLower: (session.displayName ?? '').toLowerCase(),
        labelLower: (session.label ?? '').toLowerCase(),
        surfaceLower: (session.surface ?? '').toLowerCase(),
        modelLower: (session.model ?? '').toLowerCase(),
      })),
    [sessions],
  )

  const filtered = useMemo(() => {
    let list = [...indexedSessions]

    if (quickFilter === 'active')
      list = list.filter((x) => x.session.updatedAt && Date.now() - x.session.updatedAt < ACTIVE_SESSION_MS)
    else if (quickFilter === 'highUsage') list = list.filter((x) => (x.session.totalTokens ?? 0) >= 100_000)
    else if (quickFilter === 'stale')
      list = list.filter((x) => !x.session.updatedAt || Date.now() - x.session.updatedAt > STALE_SESSION_MS)

    if (kindFilter !== 'all') list = list.filter((x) => x.session.kind === kindFilter)
    if (agentFilter !== 'all') list = list.filter((x) => extractAgentId(x.session.key) === agentFilter)

    const query = deferredSearch.trim().toLowerCase()
    if (query) {
      list = list.filter(
        (x) =>
          x.keyLower.includes(query) ||
          x.nameLower.includes(query) ||
          x.labelLower.includes(query) ||
          x.surfaceLower.includes(query) ||
          x.modelLower.includes(query),
      )
    }

    list.sort((a, b) => {
      let cmp = 0
      if (sortField === 'updated') cmp = (a.session.updatedAt ?? 0) - (b.session.updatedAt ?? 0)
      else if (sortField === 'tokens') cmp = (a.session.totalTokens ?? 0) - (b.session.totalTokens ?? 0)
      else cmp = getDisplayName(a.session).localeCompare(getDisplayName(b.session))
      return sortDir === 'desc' ? -cmp : cmp
    })

    return list.map((x) => x.session)
  }, [indexedSessions, quickFilter, kindFilter, agentFilter, deferredSearch, sortField, sortDir])

  // Reset pagination when any filter / sort / view option changes.
  // Deps are intentional triggers — not read in the callback body.
  // biome-ignore lint/correctness/useExhaustiveDependencies: trigger-only deps
  useEffect(() => {
    setDisplayLimit(DISPLAY_PAGE_SIZE)
  }, [deferredSearch, sortField, sortDir, kindFilter, agentFilter, quickFilter, viewMode, gatewayLimit])

  const visibleSessions = useMemo(() => filtered.slice(0, displayLimit), [filtered, displayLimit])
  const hasMoreSessions = visibleSessions.length < filtered.length
  const remainingSessions = Math.max(0, filtered.length - visibleSessions.length)

  const grouped = useMemo(() => {
    if (viewMode !== 'grouped') return null
    const map = new Map<string, GatewaySessionRow[]>()
    for (const session of visibleSessions) {
      const agentId = extractAgentId(session.key)
      if (!map.has(agentId)) map.set(agentId, [])
      map.get(agentId)?.push(session)
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [visibleSessions, viewMode])

  const treeRoots = useMemo(() => {
    if (viewMode !== 'tree') return null
    return buildSessionTree(visibleSessions)
  }, [visibleSessions, viewMode])

  // -- Callbacks ------------------------------------------------------------
  const toggleSelect = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }, [])

  const toggleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      else {
        setSortField(field)
        setSortDir('desc')
      }
    },
    [sortField],
  )

  const toggleBulkMode = useCallback(() => {
    setBulkMode((prev) => !prev)
    setSelected(new Set())
  }, [])

  const selectVisible = useCallback(() => setSelected(new Set(visibleSessions.map((s) => s.key))), [visibleSessions])

  const showMore = useCallback(() => setDisplayLimit((v) => v + DISPLAY_PAGE_SIZE), [])
  const showAll = useCallback(() => setDisplayLimit(filtered.length), [filtered.length])

  return {
    connected,
    sessions,
    refreshing,
    refresh,
    autoRefresh,
    setAutoRefresh,
    gatewayLimit,
    setGatewayLimit,
    search,
    setSearch,
    sortField,
    sortDir,
    toggleSort,
    kindFilter,
    setKindFilter,
    agentFilter,
    setAgentFilter,
    quickFilter,
    setQuickFilter,
    quickCounts,
    uniqueAgents,
    viewMode,
    setViewMode,
    bulkMode,
    toggleBulkMode,
    selected,
    toggleSelect,
    selectVisible,
    expandedKey,
    setExpandedKey,
    runningSessionKeys,
    maxTokens,
    filtered,
    visibleSessions,
    grouped,
    treeRoots,
    hasMoreSessions,
    remainingSessions,
    showMore,
    showAll,
    historySession,
    setHistorySession,
    sendSession,
    setSendSession,
    patchSession,
    setPatchSession,
    deleteSession,
    setDeleteSession,
    showBulkDelete,
    setShowBulkDelete,
  }
}
