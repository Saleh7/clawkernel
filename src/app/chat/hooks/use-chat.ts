// ---------------------------------------------------------------------------
//  Chat — Custom hook encapsulating all chat state & side effects
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChatEventPayload, ChatMessage, ChatMessageContent } from '@/lib/gateway/types'
import { createLogger } from '@/lib/logger'
import { selectClient, selectIsConnected, useGatewayStore } from '@/stores/gateway-store'
import type { AgentInfo, AttachmentFile, ChatQueueItem, ChatSettings, ChatState, SessionEntry, Source } from '../types'
import { FILE_TYPES, IMAGE_TYPES, TEXT_READABLE_TYPES } from '../types'
import {
  compressImage,
  compressImageBitmap,
  extractAgentId,
  extractSourcesFromMessages,
  extractText,
  fileToBase64,
  generateId,
  groupMessages,
  readFileAsText,
  sessionLabel,
} from '../utils'

const log = createLogger('chat')
const MAX_FILE_SIZE = 10 * 1024 * 1024
const HISTORY_PAGE_SIZE = 200
const STOP_COMMANDS = new Set(['stop', 'esc', 'abort', 'wait', 'exit', '/stop'])

// ---------------------------------------------------------------------------
//  Message normalization helpers (matches OpenClaw UI controllers/chat.ts)
// ---------------------------------------------------------------------------

/** Normalize a final event message — accepts assistant messages with content or text */
function normalizeFinalMessage(message: unknown): ChatMessage | null {
  if (!message || typeof message !== 'object') return null
  const m = message as Record<string, unknown>
  // Role is optional for final messages (some may omit it)
  const role = typeof m.role === 'string' ? m.role : undefined
  if (role && role !== 'assistant') return null
  // Must have content array or text field
  if (!('content' in m) && !('text' in m)) return null
  return message as ChatMessage
}

/** Normalize an aborted event message — requires role=assistant + content array */
function normalizeAbortedMessage(message: unknown): ChatMessage | null {
  if (!message || typeof message !== 'object') return null
  const m = message as Record<string, unknown>
  if (typeof m.role !== 'string' || m.role !== 'assistant') return null
  if (!Array.isArray(m.content)) return null
  return message as ChatMessage
}

// ---------------------------------------------------------------------------
//  Hook
// ---------------------------------------------------------------------------

export function useChat() {
  const client = useGatewayStore(selectClient)
  const connected = useGatewayStore(selectIsConnected)
  const connectionState = useGatewayStore((s) => s.state)
  const storeSessions = useGatewayStore((s) => s.sessions)
  const storeAgents = useGatewayStore((s) => s.agents)
  const storeActiveRuns = useGatewayStore((s) => s.activeRuns)

  // -- UI state -------------------------------------------------------------
  const [selectedSession, setSelectedSession] = useState<string | null>(null)
  const [sidebarSearch, setSidebarSearch] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [inputValue, setInputValue] = useState('')
  const inputValueRef = useRef('')
  const [attachments, setAttachments] = useState<AttachmentFile[]>([])
  const [sourcesPanel, setSourcesPanel] = useState<Source[] | null>(null)
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const dragCounter = useRef(0)
  const attachmentsRef = useRef<AttachmentFile[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [settings, setSettings] = useState<ChatSettings>(() => {
    try {
      const s = localStorage.getItem('clawkernel-chat-settings')
      return s ? JSON.parse(s) : { showToolCalls: true, showThinking: true }
    } catch (err) {
      log.warn('Failed to parse chat settings from localStorage', err)
      return { showToolCalls: true, showThinking: true }
    }
  })

  const [chat, setChat] = useState<ChatState>({
    messages: [],
    loading: false,
    loadingMore: false,
    sending: false,
    streaming: null,
    runId: null,
    thinkingLevel: null,
    error: null,
    hasMore: false,
  })

  useEffect(() => {
    inputValueRef.current = inputValue
  }, [inputValue])
  useEffect(() => {
    attachmentsRef.current = attachments
  }, [attachments])

  // Cleanup blob URLs when component unmounts with pending attachments
  useEffect(() => {
    return () => {
      for (const a of attachmentsRef.current) {
        if (a.preview) URL.revokeObjectURL(a.preview)
      }
    }
  }, [])

  // -- Persist settings -----------------------------------------------------
  useEffect(() => {
    localStorage.setItem('clawkernel-chat-settings', JSON.stringify(settings))
  }, [settings])

  // -- Agent info map -------------------------------------------------------
  const agentInfoMap = useMemo(() => {
    const map = new Map<string, AgentInfo>()
    if (storeAgents?.agents)
      for (const a of storeAgents.agents) map.set(a.id, { name: a.name || a.id, emoji: a.identity?.emoji })
    return map
  }, [storeAgents])

  // -- Session entries ------------------------------------------------------
  const sessionEntries = useMemo<SessionEntry[]>(() => {
    return storeSessions
      .filter((s) => s.key.startsWith('agent:'))
      .map((s) => ({
        ...s,
        agentId: extractAgentId(s.key),
        label: sessionLabel(s.key),
        preview: s.subject || s.displayName || undefined,
      }))
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  }, [storeSessions])

  const activeSessions = useMemo(() => {
    const set = new Set<string>()
    for (const r of Object.values(storeActiveRuns)) set.add(r.sessionKey)
    return set
  }, [storeActiveRuns])

  const sessionHasActiveRun = useMemo(() => {
    if (!selectedSession) return false
    return Object.values(storeActiveRuns).some((r) => r.sessionKey === selectedSession)
  }, [storeActiveRuns, selectedSession])

  const currentAgentId = selectedSession ? extractAgentId(selectedSession) : null
  const currentAgentInfo = currentAgentId ? agentInfoMap.get(currentAgentId) : undefined
  const currentSession = selectedSession ? storeSessions.find((s) => s.key === selectedSession) : undefined

  // -- Tool results map -----------------------------------------------------
  const toolResultsMap = useMemo(() => {
    const map = new Map<string, { content: string; isError: boolean; details?: Record<string, unknown> }>()
    for (const msg of chat.messages) {
      if (msg.role !== 'toolResult' && msg.role !== 'tool') continue
      const callId = msg.toolCallId
      if (!callId) continue
      const textParts = Array.isArray(msg.content)
        ? msg.content
            .map((c: ChatMessageContent) => ('text' in c ? (c.text ?? '') : ''))
            .filter(Boolean)
            .join('\n')
        : ''
      map.set(callId, {
        content: textParts || JSON.stringify(msg.details || {}, null, 2),
        isError: msg.isError || false,
        details: msg.details as Record<string, unknown> | undefined,
      })
    }
    return map
  }, [chat.messages])

  const displayMessages = useMemo(
    () => chat.messages.filter((m) => m.role !== 'toolResult' && m.role !== 'tool'),
    [chat.messages],
  )
  const sourcesMap = useMemo(
    () => extractSourcesFromMessages(chat.messages, toolResultsMap),
    [chat.messages, toolResultsMap],
  )

  const lastAssistantIndex = useMemo(() => {
    for (let i = displayMessages.length - 1; i >= 0; i--) if (displayMessages[i].role === 'assistant') return i
    return -1
  }, [displayMessages])

  const renderItems = useMemo(() => groupMessages(displayMessages, settings), [displayMessages, settings])

  const indicesInToolGroups = useMemo(() => {
    const set = new Set<number>()
    for (const item of renderItems) if (item.kind === 'toolGroup') for (const idx of item.indices) set.add(idx)
    return set
  }, [renderItems])

  const isStreaming = (chat.runId !== null && chat.streaming !== null) || sessionHasActiveRun

  // -- Load history ---------------------------------------------------------
  useEffect(() => {
    if (!client || !connected || !selectedSession) return
    historySessionRef.current = selectedSession
    setChat((p) => ({
      ...p,
      messages: [],
      loading: true,
      error: null,
      streaming: null,
      runId: null,
      hasMore: false,
    }))
    client
      .request<{ messages?: ChatMessage[]; thinkingLevel?: string }>('chat.history', {
        sessionKey: selectedSession,
        limit: HISTORY_PAGE_SIZE,
      })
      .then((res) => {
        if (historySessionRef.current !== selectedSession) return
        const msgs = Array.isArray(res.messages) ? res.messages : []
        setChat((p) => ({
          ...p,
          messages: msgs,
          thinkingLevel: res.thinkingLevel ?? null,
          loading: false,
          hasMore: msgs.length >= HISTORY_PAGE_SIZE,
        }))
      })
      .catch((err) => {
        if (historySessionRef.current !== selectedSession) return
        setChat((p) => ({ ...p, loading: false, error: String(err) }))
      })
  }, [client, connected, selectedSession])

  // -- Streaming events (throttled to ~30fps for smooth rendering) ----------
  const streamBufferRef = useRef<{ text: string | null; msg: ChatMessage | null; runId: string | null }>({
    text: null,
    msg: null,
    runId: null,
  })
  const streamRafRef = useRef<number | null>(null)
  const historySessionRef = useRef<string | null>(null)
  const flushQueueRef = useRef<() => void>(() => {})

  useEffect(() => {
    if (!client) return
    const unsub = client.on('chat', (payload: unknown) => {
      const p = payload as ChatEventPayload | undefined
      if (!p || p.sessionKey !== selectedSession) return

      // -- Handle events from a different run (e.g. sub-agent announce) ----
      // Matches OpenClaw UI: if another run completes on the same session,
      // append its final message without disrupting the current stream.
      setChat((prev) => {
        if (p.runId && prev.runId && p.runId !== prev.runId) {
          if (p.state === 'final') {
            const finalMsg = normalizeFinalMessage(p.message)
            if (finalMsg) {
              return { ...prev, messages: [...prev.messages, finalMsg] }
            }
            // Non-standard final (no assistant message) — reload history
            if (client && selectedSession) {
              client
                .request<{ messages?: ChatMessage[] }>('chat.history', {
                  sessionKey: selectedSession,
                  limit: HISTORY_PAGE_SIZE,
                })
                .then((res) => {
                  if (historySessionRef.current !== selectedSession) return
                  const serverMsgs = Array.isArray(res.messages) ? res.messages : []
                  setChat((p2) => {
                    const optimistic = p2.messages.filter((m) => m.__optimisticId)
                    return { ...p2, messages: optimistic.length > 0 ? [...serverMsgs, ...optimistic] : serverMsgs }
                  })
                })
                .catch((err) => log.warn('History reload failed', err))
            }
          }
          return prev
        }
        return prev
      })

      // -- Delta: buffer for RAF throttling --------------------------------
      if (p.state === 'delta') {
        const text = extractText(p.message)
        streamBufferRef.current = { text, msg: p.message ?? null, runId: p.runId ?? null }
        if (streamRafRef.current === null) {
          streamRafRef.current = requestAnimationFrame(() => {
            streamRafRef.current = null
            const buf = streamBufferRef.current
            setChat((prev) => {
              const nextStream =
                buf.text !== null && buf.text.length >= (prev.streaming?.length || 0) ? buf.text : prev.streaming
              let nextMessages = prev.messages
              if (buf.msg && buf.runId) {
                const streamMsg = { ...buf.msg, __streamRunId: buf.runId } as ChatMessage
                const streamMsgIdx = prev.messages.findIndex((m) => m.__streamRunId === buf.runId)
                if (streamMsgIdx >= 0) {
                  nextMessages = prev.messages.slice()
                  nextMessages[streamMsgIdx] = streamMsg
                } else {
                  nextMessages = [...prev.messages, streamMsg]
                }
              }
              if (nextStream === prev.streaming && nextMessages === prev.messages && (buf.runId || null) === prev.runId)
                return prev
              return { ...prev, runId: buf.runId || prev.runId, streaming: nextStream, messages: nextMessages }
            })
          })
        }
        return
      }

      // -- Final: append message from payload (matches OpenClaw UI) --------
      // Reload history only when the final event doesn't carry a valid
      // assistant message — mirrors OpenClaw's shouldReloadHistoryForFinalEvent.
      if (p.state === 'final') {
        const finalMsg = normalizeFinalMessage(p.message)
        setChat((prev) => {
          // Remove the RAF-buffered streaming placeholder
          const cleaned = prev.messages.filter((m) => !m.__streamRunId)
          if (finalMsg) {
            // Payload has a valid assistant message — no reload needed.
            // Keep the optimistic user message; the content is correct.
            return { ...prev, messages: [...cleaned, finalMsg], streaming: null, runId: null }
          }
          // No usable message in payload — strip optimistic, reload from server below
          return { ...prev, messages: cleaned.filter((m) => !m.__optimisticId), streaming: null, runId: null }
        })
        // Only reload when the server didn't send a usable assistant message
        if (!finalMsg && client && selectedSession) {
          client
            .request<{ messages?: ChatMessage[] }>('chat.history', {
              sessionKey: selectedSession,
              limit: HISTORY_PAGE_SIZE,
            })
            .then((res) => {
              if (historySessionRef.current !== selectedSession) return
              const serverMsgs = Array.isArray(res.messages) ? res.messages : []
              setChat((prev) => {
                const optimistic = prev.messages.filter((m) => m.__optimisticId)
                return { ...prev, messages: optimistic.length > 0 ? [...serverMsgs, ...optimistic] : serverMsgs }
              })
            })
            .catch((err) => log.warn('History reload failed', err))
        }
        flushQueueRef.current()
        return
      }

      // -- Error -----------------------------------------------------------
      if (p.state === 'error') {
        setChat((prev) => ({ ...prev, streaming: null, runId: null, error: p.errorMessage || 'Chat error' }))
        flushQueueRef.current()
        return
      }

      // -- Aborted: preserve any streamed text (matches OpenClaw UI) -------
      if (p.state === 'aborted') {
        setChat((prev) => {
          // If the server sent an aborted message with content, use it
          const abortedMsg = normalizeAbortedMessage(p.message)
          // Remove streaming placeholder
          const cleaned = prev.messages.filter((m) => !m.__streamRunId)
          if (abortedMsg) {
            return { ...prev, messages: [...cleaned, abortedMsg], streaming: null, runId: null }
          }
          // Otherwise preserve whatever was streamed so far
          const streamedText = prev.streaming ?? ''
          if (streamedText.trim()) {
            return {
              ...prev,
              messages: [
                ...cleaned,
                {
                  role: 'assistant',
                  content: [{ type: 'text', text: streamedText }],
                  timestamp: Date.now(),
                } as ChatMessage,
              ],
              streaming: null,
              runId: null,
            }
          }
          return { ...prev, messages: cleaned, streaming: null, runId: null }
        })
        flushQueueRef.current()
        return
      }
    })
    return () => {
      unsub()
      if (streamRafRef.current !== null) {
        cancelAnimationFrame(streamRafRef.current)
        streamRafRef.current = null
      }
    }
  }, [client, selectedSession])

  // -- Reconnect / gap recovery ---------------------------------------------
  useEffect(() => {
    if (!client || !selectedSession) return
    const reloadHistory = () => {
      if (historySessionRef.current !== selectedSession) return
      client
        .request<{ messages?: ChatMessage[] }>('chat.history', {
          sessionKey: selectedSession,
          limit: HISTORY_PAGE_SIZE,
        })
        .then((res) => {
          if (historySessionRef.current !== selectedSession) return
          const serverMsgs = Array.isArray(res.messages) ? res.messages : []
          setChat((prev) => {
            const optimistic = prev.messages.filter((m) => m.__optimisticId)
            return { ...prev, messages: optimistic.length > 0 ? [...serverMsgs, ...optimistic] : serverMsgs }
          })
        })
        .catch((err) => log.warn('History reload failed', err))
    }
    const unsubGap = client.on('gap', reloadHistory)
    const unsubReady = client.on('ready', reloadHistory)
    return () => {
      unsubGap()
      unsubReady()
    }
  }, [client, selectedSession])

  // -- File processing ------------------------------------------------------
  const processFile = useCallback(async (file: File) => {
    const id = generateId()
    const isImage = IMAGE_TYPES.includes(file.type)
    const isFile = FILE_TYPES.includes(file.type)

    if (!isImage && !isFile) {
      setAttachments((p) => [
        ...p,
        {
          id,
          file,
          preview: null,
          base64: null,
          textContent: null,
          mimeType: file.type,
          kind: 'file',
          error: 'Unsupported. Use images, PDF, JSON, TXT, MD, CSV.',
        },
      ])
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      setAttachments((p) => [
        ...p,
        {
          id,
          file,
          preview: null,
          base64: null,
          textContent: null,
          mimeType: file.type,
          kind: isImage ? 'image' : 'file',
          error: 'Too large (max 10MB)',
        },
      ])
      return
    }

    try {
      let base64: string | null = null,
        textContent: string | null = null,
        truncated = false,
        preview: string | null = null
      if (isImage) {
        preview = URL.createObjectURL(file)
        try {
          base64 = await compressImage(file)
        } catch (compressErr) {
          log.warn('compressImage failed, retrying via createImageBitmap', compressErr)
          try {
            base64 = await compressImageBitmap(file)
          } catch (bitmapErr) {
            log.warn('compressImageBitmap also failed, using raw base64', bitmapErr)
            base64 = await fileToBase64(file)
          }
        }
      } else if (TEXT_READABLE_TYPES.has(file.type)) {
        const r = await readFileAsText(file)
        textContent = r.text
        truncated = r.truncated
      } else {
        base64 = await fileToBase64(file)
      }

      setAttachments((p) => [
        ...p,
        {
          id,
          file,
          preview,
          base64,
          textContent,
          mimeType: file.type,
          kind: isImage ? 'image' : 'file',
          truncated,
        },
      ])
    } catch (err) {
      setAttachments((p) => [
        ...p,
        {
          id,
          file,
          preview: null,
          base64: null,
          textContent: null,
          mimeType: file.type,
          kind: isImage ? 'image' : 'file',
          error: err instanceof Error ? err.message : 'Failed',
        },
      ])
    }
  }, [])

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (!files) return
      e.target.value = ''
      for (const file of Array.from(files)) processFile(file)
    },
    [processFile],
  )

  const removeAttachment = useCallback((id: string) => {
    setAttachments((p) => {
      const removed = p.find((a) => a.id === id)
      if (removed?.preview) URL.revokeObjectURL(removed.preview)
      return p.filter((a) => a.id !== id)
    })
  }, [])

  // -- Clipboard paste (images) ----------------------------------------------
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      const imageFiles: File[] = []
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile()
          if (file) imageFiles.push(file)
        }
      }
      if (imageFiles.length === 0) return
      e.preventDefault()
      for (const file of imageFiles) processFile(file)
    },
    [processFile],
  )

  // -- Drag & drop ----------------------------------------------------------
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current++
    if (e.dataTransfer?.items?.length) setDragging(true)
  }, [])
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current--
    if (dragCounter.current === 0) setDragging(false)
  }, [])
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setDragging(false)
      dragCounter.current = 0
      const files = e.dataTransfer?.files
      if (!files) return
      for (const file of Array.from(files)) processFile(file)
    },
    [processFile],
  )

  // -- Message queue (send while agent is busy) ------------------------------
  const [queue, setQueue] = useState<ChatQueueItem[]>([])
  const queueRef = useRef<ChatQueueItem[]>([])
  useEffect(() => {
    queueRef.current = queue
  }, [queue])

  // Refs for values that change on every streaming token — keeps handleSend stable
  const isBusyRef = useRef(false)
  useEffect(() => {
    isBusyRef.current = isStreaming || chat.sending
  }, [isStreaming, chat.sending])
  const runIdRef = useRef<string | null>(null)
  useEffect(() => {
    runIdRef.current = chat.runId
  }, [chat.runId])

  const removeQueueItem = useCallback((id: string) => {
    setQueue((q) => q.filter((item) => item.id !== id))
  }, [])

  /** Prepare message + attachments into a sendable payload. Clears input. */
  const prepareSendPayload = useCallback(() => {
    const msg = inputValueRef.current.trim()
    const validAttachments = attachmentsRef.current.filter((a) => !a.error && (a.base64 || a.textContent))
    if (!msg && validAttachments.length === 0) return null

    setInputValue('')
    setAttachments((prev) => {
      for (const a of prev) {
        if (a.preview) URL.revokeObjectURL(a.preview)
      }
      return []
    })

    const textFileParts: string[] = []
    for (const att of validAttachments) {
      if (att.kind === 'file' && att.textContent) {
        textFileParts.push(`<file name="${att.file.name}" mime="${att.mimeType}">\n${att.textContent}\n</file>`)
      }
    }
    const fullMessage = textFileParts.length > 0 ? [msg, ...textFileParts].filter(Boolean).join('\n\n') : msg

    const contentBlocks: ChatMessageContent[] = []
    if (msg) contentBlocks.push({ type: 'text', text: msg })
    for (const att of validAttachments) {
      if (att.kind === 'image') {
        contentBlocks.push({ type: 'image', source: { type: 'base64', media_type: att.mimeType, data: att.base64 } })
      } else if (att.textContent) {
        contentBlocks.push({
          type: 'text',
          text: `📎 ${att.file.name} (${att.textContent.length.toLocaleString()} chars)`,
        })
      } else {
        contentBlocks.push({ type: 'text', text: `📎 ${att.file.name}` })
      }
    }

    const imageAttachments = validAttachments.filter((a) => a.kind === 'image' && a.base64)
    const apiAttachments = imageAttachments.map((a) => ({
      type: 'image' as const,
      mimeType: a.mimeType,
      content: a.base64!,
    }))

    return { message: fullMessage, attachments: apiAttachments, contentBlocks, id: generateId() }
  }, [])

  /** Actually send a prepared payload via the gateway. */
  const executeSend = useCallback(
    async (payload: {
      message: string
      attachments: Array<{ type: 'image'; mimeType: string; content: string }>
      contentBlocks: ChatMessageContent[]
      id: string
    }) => {
      if (!client || !connected || !selectedSession) return

      setChat((prev) => {
        // Avoid duplicating if already added as a queued optimistic message
        const alreadyExists = prev.messages.some((m) => m.__optimisticId === payload.id)
        return {
          ...prev,
          sending: true,
          error: null,
          messages: alreadyExists
            ? prev.messages
            : [
                ...prev.messages,
                {
                  role: 'user',
                  content: payload.contentBlocks,
                  timestamp: Date.now(),
                  __optimisticId: payload.id,
                } as ChatMessage,
              ],
          runId: payload.id,
          streaming: '',
        }
      })

      try {
        await client.request('chat.send', {
          sessionKey: selectedSession,
          message: payload.message,
          deliver: false,
          idempotencyKey: payload.id,
          ...(payload.attachments.length > 0 ? { attachments: payload.attachments } : {}),
        })
      } catch (err) {
        setChat((prev) => ({
          ...prev,
          sending: false,
          streaming: null,
          runId: null,
          error: String(err),
          messages: prev.messages.filter((m) => m.__optimisticId !== payload.id),
        }))
      } finally {
        setChat((prev) => ({ ...prev, sending: false }))
      }
    },
    [client, connected, selectedSession],
  )

  /** Flush the next queued message after a run completes. */
  const flushQueue = useCallback(async () => {
    const q = queueRef.current
    if (q.length === 0) return
    const [next, ...rest] = q
    setQueue(rest)
    await executeSend(next)
  }, [executeSend])
  flushQueueRef.current = flushQueue

  // -- Send -----------------------------------------------------------------
  const handleSend = useCallback(async () => {
    if (!client || !connected || !selectedSession) return

    // Stop commands abort the current run instead of sending.
    // Reads from refs — isBusyRef/runIdRef change every frame during streaming
    // but the callback must remain stable to avoid PromptInput re-renders.
    const trimmedInput = inputValueRef.current.trim().toLowerCase()
    if (trimmedInput && STOP_COMMANDS.has(trimmedInput) && isBusyRef.current) {
      setInputValue('')
      const runId = runIdRef.current
      client
        .request('chat.abort', { sessionKey: selectedSession, ...(runId ? { runId } : {}) })
        .catch((err) => log.warn('Stop command abort failed', err))
      return
    }

    const payload = prepareSendPayload()
    if (!payload) return

    if (isBusyRef.current) {
      setQueue((q) => [...q, payload])
      setChat((prev) => ({
        ...prev,
        messages: [
          ...prev.messages,
          {
            role: 'user',
            content: payload.contentBlocks,
            timestamp: Date.now(),
            __optimisticId: payload.id,
          } as ChatMessage,
        ],
      }))
      return
    }

    await executeSend(payload)
  }, [client, connected, selectedSession, prepareSendPayload, executeSend])

  // -- Retry (re-send a previous user message) ------------------------------
  const handleRetry = useCallback(
    async (userMessage: ChatMessage) => {
      if (!client || !connected || !selectedSession) return
      const text = extractText(userMessage)
      if (!text?.trim()) return

      const idempotencyKey = generateId()
      setChat((prev) => ({
        ...prev,
        sending: true,
        error: null,
        messages: [
          ...prev.messages,
          {
            role: 'user',
            content: [{ type: 'text', text }],
            timestamp: Date.now(),
            __optimisticId: idempotencyKey,
          } as ChatMessage,
        ],
        runId: idempotencyKey,
        streaming: '',
      }))

      try {
        await client.request('chat.send', {
          sessionKey: selectedSession,
          message: text,
          deliver: false,
          idempotencyKey,
        })
      } catch (err) {
        setChat((prev) => ({
          ...prev,
          sending: false,
          streaming: null,
          runId: null,
          error: String(err),
          messages: prev.messages.filter((m) => m.__optimisticId !== idempotencyKey),
        }))
      } finally {
        setChat((prev) => ({ ...prev, sending: false }))
      }
    },
    [client, connected, selectedSession],
  )

  // -- Abort ----------------------------------------------------------------
  const handleAbort = useCallback(async () => {
    if (!client || !selectedSession) return
    try {
      await client.request('chat.abort', { sessionKey: selectedSession, ...(chat.runId ? { runId: chat.runId } : {}) })
    } catch (err) {
      log.warn('Chat abort failed', err)
    }
  }, [client, selectedSession, chat.runId])

  // -- Load more (pagination) ------------------------------------------------
  const handleLoadMore = useCallback(async () => {
    if (!client || !connected || !selectedSession || chat.loadingMore || !chat.hasMore) return
    setChat((p) => ({ ...p, loadingMore: true }))
    try {
      const currentCount = chat.messages.length
      const res = await client.request<{ messages?: ChatMessage[] }>('chat.history', {
        sessionKey: selectedSession,
        limit: currentCount + HISTORY_PAGE_SIZE,
      })
      const msgs = Array.isArray(res.messages) ? res.messages : []
      setChat((p) => ({
        ...p,
        messages: msgs,
        loadingMore: false,
        hasMore: msgs.length >= currentCount + HISTORY_PAGE_SIZE,
      }))
    } catch (err) {
      log.warn('Load more history failed', err)
      setChat((p) => ({ ...p, loadingMore: false }))
    }
  }, [client, connected, selectedSession, chat.loadingMore, chat.hasMore, chat.messages.length])

  // -- Refresh --------------------------------------------------------------
  const handleRefresh = useCallback(async () => {
    if (!client || !connected || !selectedSession) return
    setChat((p) => ({ ...p, loading: true, error: null }))
    try {
      const res = await client.request<{ messages?: ChatMessage[]; thinkingLevel?: string }>('chat.history', {
        sessionKey: selectedSession,
        limit: HISTORY_PAGE_SIZE,
      })
      const msgs = Array.isArray(res.messages) ? res.messages : []
      setChat((p) => ({
        ...p,
        messages: msgs,
        thinkingLevel: res.thinkingLevel ?? p.thinkingLevel,
        loading: false,
        streaming: null,
        runId: null,
        hasMore: msgs.length >= HISTORY_PAGE_SIZE,
      }))
    } catch (err) {
      setChat((p) => ({ ...p, loading: false, error: String(err) }))
    }
  }, [client, connected, selectedSession])

  return {
    // State
    connected,
    connectionState,
    selectedSession,
    sidebarSearch,
    sidebarOpen,
    inputValue,
    attachments,
    sourcesPanel,
    lightboxSrc,
    dragging,
    settings,
    chat,
    isStreaming,
    queue,
    fileInputRef,
    // Derived
    sessionEntries,
    agentInfoMap,
    activeSessions,
    currentAgentId,
    currentAgentInfo,
    currentSession,
    toolResultsMap,
    displayMessages,
    sourcesMap,
    lastAssistantIndex,
    renderItems,
    indicesInToolGroups,
    // Actions
    setSelectedSession,
    setSidebarSearch,
    setSidebarOpen,
    setInputValue,
    setSourcesPanel,
    setLightboxSrc,
    setSettings,
    handleFileSelect,
    handlePaste,
    removeAttachment,
    removeQueueItem,
    handleSend,
    handleRetry,
    handleAbort,
    handleLoadMore,
    handleRefresh,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
  }
}
