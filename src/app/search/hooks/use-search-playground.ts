import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { createLogger } from '@/lib/logger'
import { useGatewayStore } from '@/stores/gateway-store'
import type { PlaygroundState } from '../types'

const log = createLogger('search:playground')

/** Extract the full accumulated text from a chat event message payload. */
function extractMessageText(msg: unknown): string {
  if (!msg || typeof msg !== 'object') return ''
  const m = msg as Record<string, unknown>
  // Content blocks (standard format)
  if (Array.isArray(m.content)) {
    return m.content
      .filter((b): b is Record<string, unknown> => typeof b === 'object' && b !== null)
      .map((b) => (b.type === 'text' && typeof b.text === 'string' ? b.text : ''))
      .join('')
  }
  // Fallback: top-level text field
  if (typeof m.text === 'string') return m.text
  return ''
}

const IDLE_STATE: PlaygroundState = {
  running: false,
  text: '',
  status: 'idle',
  errorMessage: null,
  durationMs: null,
  provider: null,
}

export function useSearchPlayground() {
  const client = useGatewayStore((s) => s.client)
  const connected = useGatewayStore((s) => s.state === 'connected')

  const [state, setState] = useState<PlaygroundState>(IDLE_STATE)

  const runIdRef = useRef<string | null>(null)
  const startedAtRef = useRef<number>(0)
  const unsubRef = useRef<(() => void) | null>(null)

  // F1 — cleanup subscription on unmount (navigation away mid-search)
  useEffect(
    () => () => {
      unsubRef.current?.()
    },
    [],
  )

  const reset = useCallback(() => {
    unsubRef.current?.()
    unsubRef.current = null
    runIdRef.current = null
    setState(IDLE_STATE)
  }, [])

  const runSearch = useCallback(
    async ({
      sessionKey,
      query,
      resultCount,
      provider,
    }: {
      sessionKey: string
      query: string
      resultCount: number
      provider: string
    }) => {
      if (!client || !connected || !query.trim()) return

      // Clean up any previous run
      unsubRef.current?.()
      unsubRef.current = null

      const idempotencyKey = crypto.randomUUID()
      runIdRef.current = idempotencyKey
      startedAtRef.current = Date.now()

      setState({ running: true, text: '', status: 'streaming', errorMessage: null, durationMs: null, provider })

      // Subscribe to chat broadcast events before sending the message
      const unsub = client.on('chat', (payload: unknown) => {
        const p = payload as { runId?: string; state?: string; message?: unknown; errorMessage?: string } | undefined
        if (!p || p.runId !== runIdRef.current) return

        if (p.state === 'delta') {
          // Each delta carries the full accumulated text so far — set, don't append.
          const text = extractMessageText(p.message)
          if (text) setState((prev) => ({ ...prev, text }))
          return
        }

        if (p.state === 'final') {
          const text = extractMessageText(p.message)
          const durationMs = Date.now() - startedAtRef.current
          setState((prev) => ({
            ...prev,
            running: false,
            text: text || prev.text,
            status: 'done',
            errorMessage: null,
            durationMs,
          }))
          unsubRef.current?.()
          unsubRef.current = null
          runIdRef.current = null
          return
        }

        if (p.state === 'error' || p.state === 'aborted') {
          const durationMs = Date.now() - startedAtRef.current
          setState((prev) => ({
            ...prev,
            running: false,
            status: 'error',
            errorMessage: p.errorMessage ?? 'Search failed',
            durationMs,
          }))
          unsubRef.current?.()
          unsubRef.current = null
          runIdRef.current = null
        }
      })
      unsubRef.current = unsub

      const message =
        `Use the web_search tool to search for: ${query.trim()} ` +
        `(return up to ${resultCount} results). Show the results with titles, URLs, and brief snippets.`

      try {
        await client.request('chat.send', {
          sessionKey,
          message,
          deliver: false,
          idempotencyKey,
        })
      } catch (err) {
        log.error('chat.send failed', err)
        const msg = err instanceof Error ? err.message : String(err)
        setState((prev) => ({
          ...prev,
          running: false,
          status: 'error',
          errorMessage: msg,
          durationMs: Date.now() - startedAtRef.current,
          provider,
        }))
        unsub()
        unsubRef.current = null
        runIdRef.current = null
        toast.error(`Search failed: ${msg}`)
      }
    },
    [client, connected],
  )

  return { state, runSearch, reset }
}
