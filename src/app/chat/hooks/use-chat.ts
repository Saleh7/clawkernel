// ---------------------------------------------------------------------------
//  Chat — Custom hook encapsulating all chat state & side effects
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { extractAgentId, sessionLabel } from '@/app/sessions/utils'
import type { GatewayClient } from '@/lib/gateway/client'
import type { ChatEventPayload, ChatMessage, ChatMessageContent } from '@/lib/gateway/types'
import { createLogger } from '@/lib/logger'
import { selectClient, selectIsConnected, useGatewayStore } from '@/stores/gateway-store'
import type { AgentInfo, AttachmentFile, ChatQueueItem, ChatSettings, ChatState, SessionEntry, Source } from '../types'
import { FILE_TYPES, IMAGE_TYPES, TEXT_READABLE_TYPES } from '../types'
import {
  compressImage,
  compressImageBitmap,
  extractSourcesFromMessages,
  extractText,
  fileToBase64,
  generateId,
  groupMessages,
  readFileAsText,
} from '../utils'

const log = createLogger('chat')
const MAX_FILE_SIZE = 10 * 1024 * 1024
const HISTORY_PAGE_SIZE = 200
const STOP_COMMANDS = new Set(['stop', 'esc', 'abort', 'wait', 'exit', '/stop'])
const DEFAULT_CHAT_SETTINGS: ChatSettings = { showToolCalls: true, showThinking: true }

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

type ToolResultMap = Map<string, { content: string; isError: boolean; details?: Record<string, unknown> }>
type StreamBuffer = { text: string | null; msg: ChatMessage | null; runId: string | null }
type ChatStateSetter = React.Dispatch<React.SetStateAction<ChatState>>
type RefBox<T> = { current: T }

function toHistoryMessages(messages: ChatMessage[] | undefined): ChatMessage[] {
  return Array.isArray(messages) ? messages : []
}

function collectOptimisticMessages(messages: ChatMessage[]): ChatMessage[] {
  const optimistic: ChatMessage[] = []
  for (const message of messages) {
    if (message.__optimisticId) optimistic.push(message)
  }
  return optimistic
}

function mergeServerMessages(serverMessages: ChatMessage[], currentMessages: ChatMessage[]): ChatMessage[] {
  const optimistic = collectOptimisticMessages(currentMessages)
  return optimistic.length > 0 ? [...serverMessages, ...optimistic] : serverMessages
}

function getStreamRunId(message: ChatMessage): string | null {
  const runId = message.__streamRunId
  return typeof runId === 'string' ? runId : null
}

function removeStreamPlaceholderMessages(messages: ChatMessage[]): ChatMessage[] {
  const cleaned: ChatMessage[] = []
  for (const message of messages) {
    if (getStreamRunId(message)) continue
    cleaned.push(message)
  }
  return cleaned
}

function removeOptimisticMessages(messages: ChatMessage[]): ChatMessage[] {
  const cleaned: ChatMessage[] = []
  for (const message of messages) {
    if (message.__optimisticId) continue
    cleaned.push(message)
  }
  return cleaned
}

function findStreamMessageIndex(messages: ChatMessage[], runId: string): number {
  for (let i = 0; i < messages.length; i++) {
    if (getStreamRunId(messages[i]) === runId) return i
  }
  return -1
}

function applyDeltaStreamState(prev: ChatState, buffer: StreamBuffer): ChatState {
  const nextStream =
    buffer.text !== null && buffer.text.length >= (prev.streaming?.length ?? 0) ? buffer.text : prev.streaming

  let nextMessages = prev.messages
  if (buffer.msg && buffer.runId) {
    const streamMessage = { ...buffer.msg, __streamRunId: buffer.runId } as ChatMessage
    const streamMessageIndex = findStreamMessageIndex(prev.messages, buffer.runId)
    if (streamMessageIndex >= 0) {
      nextMessages = prev.messages.slice()
      nextMessages[streamMessageIndex] = streamMessage
    } else {
      nextMessages = [...prev.messages, streamMessage]
    }
  }

  const nextRunId = buffer.runId ?? prev.runId
  if (nextStream === prev.streaming && nextMessages === prev.messages && nextRunId === prev.runId) return prev

  return { ...prev, runId: nextRunId, streaming: nextStream, messages: nextMessages }
}

function applyFinalEventState(prev: ChatState, finalMessage: ChatMessage | null): ChatState {
  const cleanedMessages = removeStreamPlaceholderMessages(prev.messages)
  if (finalMessage) {
    return { ...prev, messages: [...cleanedMessages, finalMessage], streaming: null, runId: null }
  }
  return { ...prev, messages: removeOptimisticMessages(cleanedMessages), streaming: null, runId: null }
}

function buildAbortedFallbackMessage(streamedText: string): ChatMessage {
  return {
    role: 'assistant',
    content: [{ type: 'text', text: streamedText }],
    timestamp: Date.now(),
  }
}

function applyAbortedEventState(prev: ChatState, abortedMessage: ChatMessage | null): ChatState {
  const cleanedMessages = removeStreamPlaceholderMessages(prev.messages)
  if (abortedMessage) {
    return { ...prev, messages: [...cleanedMessages, abortedMessage], streaming: null, runId: null }
  }

  const streamedText = prev.streaming ?? ''
  if (!streamedText.trim()) return { ...prev, messages: cleanedMessages, streaming: null, runId: null }

  return {
    ...prev,
    messages: [...cleanedMessages, buildAbortedFallbackMessage(streamedText)],
    streaming: null,
    runId: null,
  }
}

function isDifferentRunEvent(eventRunId: string | null | undefined, activeRunId: string | null): boolean {
  if (!eventRunId || !activeRunId) return false
  return eventRunId !== activeRunId
}

function flushBufferedStreamState(setChat: ChatStateSetter, streamBufferRef: RefBox<StreamBuffer>): void {
  setChat((prev) => applyDeltaStreamState(prev, streamBufferRef.current))
}

async function reloadHistoryPreservingOptimistic(params: {
  client: GatewayClient
  selectedSession: string
  historySessionRef: RefBox<string | null>
  setChat: ChatStateSetter
}): Promise<void> {
  const { client, selectedSession, historySessionRef, setChat } = params

  try {
    const response = await client.request<{ messages?: ChatMessage[] }>('chat.history', {
      sessionKey: selectedSession,
      limit: HISTORY_PAGE_SIZE,
    })
    if (historySessionRef.current !== selectedSession) return

    const serverMessages = toHistoryMessages(response.messages)
    setChat((prev) => ({
      ...prev,
      messages: mergeServerMessages(serverMessages, prev.messages),
    }))
  } catch (error_) {
    log.warn('History reload failed', error_)
  }
}

async function loadSessionHistory(params: {
  client: GatewayClient
  selectedSession: string
  historySessionRef: RefBox<string | null>
  setChat: ChatStateSetter
}): Promise<void> {
  const { client, selectedSession, historySessionRef, setChat } = params

  try {
    const response = await client.request<{ messages?: ChatMessage[]; thinkingLevel?: string }>('chat.history', {
      sessionKey: selectedSession,
      limit: HISTORY_PAGE_SIZE,
    })
    if (historySessionRef.current !== selectedSession) return

    const messages = toHistoryMessages(response.messages)
    setChat((prev) => ({
      ...prev,
      messages,
      thinkingLevel: response.thinkingLevel ?? null,
      loading: false,
      hasMore: messages.length >= HISTORY_PAGE_SIZE,
    }))
  } catch (error_) {
    if (historySessionRef.current !== selectedSession) return
    setChat((prev) => ({ ...prev, loading: false, error: String(error_) }))
  }
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
      return s ? { ...DEFAULT_CHAT_SETTINGS, ...JSON.parse(s) } : DEFAULT_CHAT_SETTINGS
    } catch (err) {
      log.warn('Failed to parse chat settings from localStorage', err)
      return DEFAULT_CHAT_SETTINGS
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
    const map: ToolResultMap = new Map()
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
        details: msg.details,
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

  const renderItems = useMemo(() => groupMessages(displayMessages), [displayMessages])

  const indicesInToolGroups = useMemo(() => {
    const set = new Set<number>()
    for (const item of renderItems) if (item.kind === 'toolGroup') for (const idx of item.indices) set.add(idx)
    return set
  }, [renderItems])

  const isStreaming = (chat.runId !== null && chat.streaming !== null) || sessionHasActiveRun

  // -- Streaming events (throttled to ~30fps for smooth rendering) ----------
  const streamBufferRef = useRef<StreamBuffer>({ text: null, msg: null, runId: null })
  const streamRafRef = useRef<number | null>(null)
  const historySessionRef = useRef<string | null>(null)
  const flushQueueRef = useRef<() => void>(() => {})
  const runIdRef = useRef<string | null>(null)

  useEffect(() => {
    runIdRef.current = chat.runId
  }, [chat.runId])

  const flushBufferedStream = useCallback(() => {
    streamRafRef.current = null
    flushBufferedStreamState(setChat, streamBufferRef)
  }, [])

  const scheduleBufferedStreamFlush = useCallback(() => {
    streamRafRef.current ??= requestAnimationFrame(flushBufferedStream)
  }, [flushBufferedStream])

  const reloadHistory = useCallback(() => {
    if (!client || !selectedSession) return
    if (historySessionRef.current !== selectedSession) return
    void reloadHistoryPreservingOptimistic({
      client,
      selectedSession,
      historySessionRef,
      setChat,
    })
  }, [client, selectedSession])

  // -- Load history ---------------------------------------------------------
  useEffect(() => {
    if (!client || !connected || !selectedSession) return

    historySessionRef.current = selectedSession
    setChat((prev) => ({
      ...prev,
      messages: [],
      loading: true,
      error: null,
      streaming: null,
      runId: null,
      hasMore: false,
    }))

    void loadSessionHistory({
      client,
      selectedSession,
      historySessionRef,
      setChat,
    })
  }, [client, connected, selectedSession])

  const handleChatEvent = useCallback(
    (payload: unknown) => {
      const event = payload as ChatEventPayload | undefined
      if (event?.sessionKey !== selectedSession) return

      if (isDifferentRunEvent(event.runId, runIdRef.current)) {
        if (event.state !== 'final') return

        const finalMessage = normalizeFinalMessage(event.message)
        if (finalMessage) {
          setChat((prev) => ({ ...prev, messages: [...prev.messages, finalMessage] }))
          return
        }

        reloadHistory()
        return
      }

      if (event.state === 'delta') {
        streamBufferRef.current = {
          text: extractText(event.message),
          msg: event.message ?? null,
          runId: event.runId ?? null,
        }
        scheduleBufferedStreamFlush()
        return
      }

      if (event.state === 'final') {
        const finalMessage = normalizeFinalMessage(event.message)
        setChat((prev) => applyFinalEventState(prev, finalMessage))
        if (!finalMessage) reloadHistory()
        flushQueueRef.current()
        return
      }

      if (event.state === 'error') {
        setChat((prev) => ({ ...prev, streaming: null, runId: null, error: event.errorMessage ?? 'Chat error' }))
        flushQueueRef.current()
        return
      }

      if (event.state !== 'aborted') return

      const abortedMessage = normalizeAbortedMessage(event.message)
      setChat((prev) => applyAbortedEventState(prev, abortedMessage))
      flushQueueRef.current()
    },
    [reloadHistory, scheduleBufferedStreamFlush, selectedSession],
  )

  useEffect(() => {
    if (!client) return

    const unsubscribe = client.on('chat', handleChatEvent)
    return () => {
      unsubscribe()
      if (streamRafRef.current === null) return
      cancelAnimationFrame(streamRafRef.current)
      streamRafRef.current = null
    }
  }, [client, handleChatEvent])

  // -- Reconnect / gap recovery ---------------------------------------------
  useEffect(() => {
    if (!client || !selectedSession) return

    const unsubscribeGap = client.on('gap', reloadHistory)
    const unsubscribeReady = client.on('ready', reloadHistory)
    return () => {
      unsubscribeGap()
      unsubscribeReady()
    }
  }, [client, reloadHistory, selectedSession])

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

    let preview: string | null = null
    try {
      let base64: string | null = null,
        textContent: string | null = null,
        truncated = false
      if (isImage) {
        preview = URL.createObjectURL(file)
        try {
          base64 = await compressImage(file)
        } catch (error_) {
          log.warn('compressImage failed, retrying via createImageBitmap', error_)
          try {
            base64 = await compressImageBitmap(file)
          } catch (error_) {
            log.warn('compressImageBitmap also failed, using raw base64', error_)
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
      if (preview) URL.revokeObjectURL(preview)
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
      for (const item of Array.from(items)) {
        if (!item.type.startsWith('image/')) continue
        const file = item.getAsFile()
        if (file) imageFiles.push(file)
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
        setChat((prev) => ({ ...prev, sending: false }))
      } catch (err) {
        setChat((prev) => ({
          ...prev,
          sending: false,
          streaming: null,
          runId: null,
          error: String(err),
          messages: prev.messages.filter((m) => m.__optimisticId !== payload.id),
        }))
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
  flushQueueRef.current = () => {
    void flushQueue()
  }

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
      if (isBusyRef.current) return
      const text = extractText(userMessage)
      if (!text?.trim()) return

      const id = generateId()
      const contentBlocks: ChatMessageContent[] = [{ type: 'text', text }]
      await executeSend({ message: text, attachments: [], contentBlocks, id })
    },
    [client, connected, selectedSession, executeSend],
  )

  // -- Abort ----------------------------------------------------------------
  const handleAbort = useCallback(async () => {
    if (!client || !selectedSession) return
    try {
      const runId = runIdRef.current
      await client.request('chat.abort', { sessionKey: selectedSession, ...(runId ? { runId } : {}) })
    } catch (err) {
      log.warn('Chat abort failed', err)
    }
  }, [client, selectedSession])

  // -- Load more (pagination) ------------------------------------------------
  const handleLoadMore = useCallback(async () => {
    if (!client || !connected || !selectedSession || chat.loadingMore || !chat.hasMore) return
    if (chat.runId !== null) return
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
  }, [client, connected, selectedSession, chat.loadingMore, chat.hasMore, chat.runId, chat.messages.length])

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
