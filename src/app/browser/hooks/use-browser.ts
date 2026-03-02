import { useCallback, useEffect, useState } from 'react'
import type { BrowserStatus } from '@/lib/gateway/types'
import { createLogger } from '@/lib/logger'
import { useGatewayStore } from '@/stores/gateway-store'
import type { HistoryEntry, RequestMethod } from '../types'

const log = createLogger('browser')
const MAX_HISTORY = 20

// Result returned from sendRequest (shown in response viewer)
export type SendResult = { ok: true; body: unknown } | { ok: false; errorMessage: string; details?: unknown }

export function useBrowser() {
  const client = useGatewayStore((s) => s.client)
  const connected = useGatewayStore((s) => s.state === 'connected')

  const [status, setStatus] = useState<BrowserStatus | null>(null)
  const [probeLoading, setProbeLoading] = useState(true)
  const [disabled, setDisabled] = useState(false)
  const [probeError, setProbeError] = useState<string | null>(null)

  const [sending, setSending] = useState(false)
  const [lastResult, setLastResult] = useState<SendResult | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])

  const probe = useCallback(async () => {
    if (!client) return
    setProbeLoading(true)
    setProbeError(null)
    try {
      const res = await client.request<BrowserStatus>('browser.request', {
        method: 'GET',
        path: '/',
      })
      setStatus(res)
      setDisabled(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log.warn('browser probe failed', err)
      setStatus(null)
      if (msg.toLowerCase().includes('disabled') || msg.toLowerCase().includes('unavailable')) {
        setDisabled(true)
        setProbeError(null)
      } else {
        setDisabled(false)
        setProbeError(msg)
      }
    } finally {
      setProbeLoading(false)
    }
  }, [client])

  useEffect(() => {
    if (connected) void probe()
  }, [connected, probe])

  const sendRequest = useCallback(
    async (params: {
      method: RequestMethod
      path: string
      query: string // raw JSON string from textarea (may be empty)
      body: string // raw JSON string from textarea (may be empty)
    }): Promise<SendResult> => {
      if (!client || sending) return { ok: false, errorMessage: 'Not connected' }

      let parsedQuery: Record<string, unknown> | undefined
      let parsedBody: unknown

      if (params.query.trim()) {
        try {
          parsedQuery = JSON.parse(params.query) as Record<string, unknown>
        } catch {
          return { ok: false, errorMessage: 'Invalid query JSON' }
        }
      }

      if (params.method !== 'GET' && params.body.trim()) {
        try {
          parsedBody = JSON.parse(params.body)
        } catch {
          return { ok: false, errorMessage: 'Invalid body JSON' }
        }
      }

      setSending(true)
      const startMs = Date.now()

      const requestParams: Record<string, unknown> = {
        method: params.method,
        path: params.path.startsWith('/') ? params.path : `/${params.path}`,
      }
      if (parsedQuery) requestParams.query = parsedQuery
      if (parsedBody !== undefined) requestParams.body = parsedBody

      let result: SendResult

      try {
        const res = await client.request<unknown>('browser.request', requestParams)
        result = { ok: true, body: res }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        result = { ok: false, errorMessage: msg }
      } finally {
        setSending(false)
      }

      const durationMs = Date.now() - startMs

      const entry: HistoryEntry = {
        id: crypto.randomUUID(),
        method: params.method,
        path: requestParams.path as string,
        ok: result.ok,
        durationMs,
        responseBody: result.ok ? result.body : null,
        errorMessage: result.ok ? null : result.errorMessage,
      }

      setHistory((prev) => [entry, ...prev].slice(0, MAX_HISTORY))
      setLastResult(result)

      void probe()

      return result
    },
    [client, sending, probe],
  )

  return {
    status,
    probeLoading,
    disabled,
    probeError,
    sending,
    lastResult,
    history,
    probe,
    sendRequest,
  }
}
