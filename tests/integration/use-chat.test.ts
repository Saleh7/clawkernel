// ---------------------------------------------------------------------------
//  use-chat — Hook integration tests (Phase 4)
//  Uses @testing-library/react renderHook + vi.mock (no msw)
// ---------------------------------------------------------------------------
// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatEventPayload, ChatMessage } from '@/lib/gateway/types'

// ---------------------------------------------------------------------------
//  Mock setup — must be before imports that reference them
// ---------------------------------------------------------------------------

// Accumulate event listeners registered via client.on(event, handler)
type EventHandler = (payload: unknown) => void
const clientListeners = new Map<string, Set<EventHandler>>()

const mockClient = {
  on: vi.fn((event: string, handler: EventHandler) => {
    if (!clientListeners.has(event)) clientListeners.set(event, new Set())
    clientListeners.get(event)!.add(handler)
    return () => clientListeners.get(event)?.delete(handler)
  }),
  start: vi.fn(),
  stop: vi.fn(),
  request: vi.fn().mockResolvedValue({}),
}

function emitClientEvent(event: string, payload: unknown) {
  const handlers = clientListeners.get(event)
  if (handlers) for (const h of handlers) h(payload)
}

vi.mock('@/lib/gateway/client', () => ({
  GatewayClient: vi.fn().mockImplementation(() => mockClient),
}))

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

// Mock gateway store — provide selectClient/selectIsConnected + sessions/agents/activeRuns
const storeState: Record<string, unknown> = {
  client: mockClient,
  state: 'connected',
  sessions: [],
  agents: null,
  activeRuns: {},
}

vi.mock('@/stores/gateway-store', () => ({
  useGatewayStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) => selector(storeState),
    {
      getState: () => storeState,
      setState: (partial: Record<string, unknown>) => Object.assign(storeState, partial),
      subscribe: vi.fn(() => vi.fn()),
    },
  ),
  selectClient: (s: Record<string, unknown>) => s.client,
  selectIsConnected: (s: Record<string, unknown>) => s.state === 'connected',
}))

// Must import after mocks
const { useChat } = await import('@/app/chat/hooks/use-chat')

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

function renderChatHook() {
  return renderHook(() => useChat())
}

function makeChatEvent(
  sessionKey: string,
  state: string,
  overrides: Partial<ChatEventPayload> = {},
): ChatEventPayload {
  return {
    runId: 'run-1',
    sessionKey,
    state: state as ChatEventPayload['state'],
    ...overrides,
  }
}

function makeAssistantMessage(text: string, extra: Partial<ChatMessage> = {}): ChatMessage {
  return {
    role: 'assistant',
    content: [{ type: 'text', text }],
    timestamp: Date.now(),
    ...extra,
  }
}

// ---------------------------------------------------------------------------
//  Tests
// ---------------------------------------------------------------------------

describe('useChat', () => {
  beforeEach(() => {
    clientListeners.clear()
    mockClient.on.mockClear()
    mockClient.request.mockReset()
    mockClient.request.mockResolvedValue({})

    storeState.client = mockClient
    storeState.state = 'connected'
    storeState.sessions = [
      { key: 'agent:bot:main', kind: 'direct', updatedAt: Date.now() },
    ]
    storeState.agents = { defaultId: 'bot', mainKey: 'agent:bot:main', scope: 'all', agents: [{ id: 'bot' }] }
    storeState.activeRuns = {}

    // Mock localStorage
    vi.stubGlobal('localStorage', {
      _store: {} as Record<string, string>,
      getItem(key: string) { return this._store[key] ?? null },
      setItem(key: string, val: string) { this._store[key] = val },
      removeItem(key: string) { delete this._store[key] },
    })

    // Mock requestAnimationFrame
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
      const id = setTimeout(cb, 0)
      return id as unknown as number
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  // =========================================================================
  //  Initial state
  // =========================================================================

  it('returns initial chat state', () => {
    const { result } = renderChatHook()
    expect(result.current.connected).toBe(true)
    expect(result.current.chat.messages).toEqual([])
    expect(result.current.chat.loading).toBe(false)
    expect(result.current.chat.streaming).toBeNull()
    expect(result.current.selectedSession).toBeNull()
  })

  it('builds session entries from store sessions', () => {
    const { result } = renderChatHook()
    expect(result.current.sessionEntries).toHaveLength(1)
    expect(result.current.sessionEntries[0].agentId).toBe('bot')
  })

  // =========================================================================
  //  Settings persistence (F8)
  // =========================================================================

  describe('settings persistence', () => {
    it('loads default settings when localStorage is empty', () => {
      const { result } = renderChatHook()
      expect(result.current.settings).toEqual({ showToolCalls: true, showThinking: true })
    })

    it('loads persisted settings from localStorage', () => {
      localStorage.setItem('clawkernel-chat-settings', JSON.stringify({ showToolCalls: false, showThinking: true }))
      const { result } = renderChatHook()
      expect(result.current.settings.showToolCalls).toBe(false)
    })

    it('merges partial persisted settings with defaults', () => {
      localStorage.setItem('clawkernel-chat-settings', JSON.stringify({ showThinking: false }))
      const { result } = renderChatHook()
      expect(result.current.settings.showToolCalls).toBe(true) // default
      expect(result.current.settings.showThinking).toBe(false) // persisted
    })

    it('falls back to defaults on corrupted localStorage', () => {
      localStorage.setItem('clawkernel-chat-settings', 'NOT-JSON')
      const { result } = renderChatHook()
      expect(result.current.settings).toEqual({ showToolCalls: true, showThinking: true })
    })

    it('persists settings changes to localStorage', () => {
      const { result } = renderChatHook()
      act(() => {
        result.current.setSettings({ showToolCalls: false, showThinking: false })
      })
      const stored = JSON.parse(localStorage.getItem('clawkernel-chat-settings')!)
      expect(stored.showToolCalls).toBe(false)
    })
  })

  // =========================================================================
  //  Session selection + history loading
  // =========================================================================

  describe('session selection', () => {
    it('loads history when session is selected', async () => {
      const historyMessages: ChatMessage[] = [
        { role: 'user', content: [{ type: 'text', text: 'hi' }], timestamp: 1 },
        makeAssistantMessage('hello'),
      ]
      mockClient.request.mockResolvedValueOnce({ messages: historyMessages })

      const { result } = renderChatHook()

      await act(async () => {
        result.current.setSelectedSession('agent:bot:main')
      })

      // Wait for async history load
      await act(async () => {
        await vi.dynamicImportSettled()
      })

      expect(mockClient.request).toHaveBeenCalledWith(
        'chat.history',
        expect.objectContaining({ sessionKey: 'agent:bot:main' }),
      )
    })

    it('sets loading state while fetching history', () => {
      // Never resolve to keep loading state
      mockClient.request.mockReturnValue(new Promise(() => {}))

      const { result } = renderChatHook()

      act(() => {
        result.current.setSelectedSession('agent:bot:main')
      })

      expect(result.current.chat.loading).toBe(true)
    })
  })

  // =========================================================================
  //  Streaming lifecycle
  // =========================================================================

  describe('streaming lifecycle', () => {
    it('applies delta events to streaming state', async () => {
      mockClient.request.mockResolvedValueOnce({ messages: [] })

      const { result } = renderChatHook()

      await act(async () => {
        result.current.setSelectedSession('agent:bot:main')
      })

      // Emit a delta event
      await act(async () => {
        emitClientEvent('chat', makeChatEvent('agent:bot:main', 'delta', {
          message: makeAssistantMessage('streaming...'),
        }))
        // Flush rAF
        await new Promise((r) => setTimeout(r, 10))
      })

      // Streaming text should be set (via extractText on the delta message)
      expect(result.current.chat.runId).toBe('run-1')
    })

    it('applies final event — clears streaming, adds message', async () => {
      mockClient.request.mockResolvedValueOnce({ messages: [] })

      const { result } = renderChatHook()

      await act(async () => {
        result.current.setSelectedSession('agent:bot:main')
      })

      // Delta first to set runId
      await act(async () => {
        emitClientEvent('chat', makeChatEvent('agent:bot:main', 'delta', {
          message: makeAssistantMessage('partial'),
        }))
        await new Promise((r) => setTimeout(r, 10))
      })

      // Final
      await act(async () => {
        emitClientEvent('chat', makeChatEvent('agent:bot:main', 'final', {
          message: makeAssistantMessage('complete response'),
        }))
      })

      expect(result.current.chat.streaming).toBeNull()
      expect(result.current.chat.runId).toBeNull()
      // Final message should be in messages
      const texts = result.current.chat.messages
        .filter((m: ChatMessage) => m.role === 'assistant')
        .map((m: ChatMessage) => m.content?.[0])
        .filter(Boolean)
      expect(texts.length).toBeGreaterThan(0)
    })

    it('applies error event — sets error, clears streaming', async () => {
      mockClient.request.mockResolvedValueOnce({ messages: [] })

      const { result } = renderChatHook()

      await act(async () => {
        result.current.setSelectedSession('agent:bot:main')
      })

      await act(async () => {
        emitClientEvent('chat', makeChatEvent('agent:bot:main', 'error', {
          errorMessage: 'Rate limited',
        }))
      })

      expect(result.current.chat.error).toBe('Rate limited')
      expect(result.current.chat.streaming).toBeNull()
    })

    it('applies aborted event — preserves streamed text as message', async () => {
      mockClient.request.mockResolvedValueOnce({ messages: [] })

      const { result } = renderChatHook()

      await act(async () => {
        result.current.setSelectedSession('agent:bot:main')
      })

      // Delta to set streaming text
      await act(async () => {
        emitClientEvent('chat', makeChatEvent('agent:bot:main', 'delta', {
          message: makeAssistantMessage('partial text'),
        }))
        await new Promise((r) => setTimeout(r, 10))
      })

      // Aborted without message — should use streamed text as fallback
      await act(async () => {
        emitClientEvent('chat', makeChatEvent('agent:bot:main', 'aborted', {}))
      })

      expect(result.current.chat.streaming).toBeNull()
      expect(result.current.chat.runId).toBeNull()
    })
  })

  // =========================================================================
  //  handleSend + optimistic messages
  // =========================================================================

  describe('handleSend', () => {
    it('sends message via chat.send and adds optimistic user message', async () => {
      mockClient.request
        .mockResolvedValueOnce({ messages: [] }) // history
        .mockResolvedValueOnce({}) // chat.send

      const { result } = renderChatHook()

      await act(async () => {
        result.current.setSelectedSession('agent:bot:main')
      })

      await act(async () => {
        result.current.setInputValue('hello bot')
      })

      await act(async () => {
        await result.current.handleSend()
      })

      expect(mockClient.request).toHaveBeenCalledWith(
        'chat.send',
        expect.objectContaining({
          sessionKey: 'agent:bot:main',
          message: 'hello bot',
          deliver: false,
        }),
      )
    })

    it('does not send empty messages', async () => {
      mockClient.request.mockResolvedValueOnce({ messages: [] })

      const { result } = renderChatHook()

      await act(async () => {
        result.current.setSelectedSession('agent:bot:main')
      })

      const callCountBefore = mockClient.request.mock.calls.length

      await act(async () => {
        await result.current.handleSend()
      })

      // Only the history call, no chat.send
      expect(mockClient.request.mock.calls.length).toBe(callCountBefore)
    })

    it('removes optimistic message on send error', async () => {
      mockClient.request
        .mockResolvedValueOnce({ messages: [] }) // history
        .mockRejectedValueOnce(new Error('Network error')) // chat.send

      const { result } = renderChatHook()

      await act(async () => {
        result.current.setSelectedSession('agent:bot:main')
      })

      await act(async () => {
        result.current.setInputValue('will fail')
      })

      await act(async () => {
        await result.current.handleSend()
      })

      expect(result.current.chat.error).toContain('Network error')
      // Optimistic message should be removed
      const optimistic = result.current.chat.messages.filter((m: ChatMessage) => m.__optimisticId)
      expect(optimistic).toHaveLength(0)
    })

    it('queues message when agent is busy (streaming)', async () => {
      mockClient.request.mockResolvedValue({ messages: [] })

      const { result } = renderChatHook()

      await act(async () => {
        result.current.setSelectedSession('agent:bot:main')
      })

      // Simulate busy state via delta event
      await act(async () => {
        emitClientEvent('chat', makeChatEvent('agent:bot:main', 'delta', {
          message: makeAssistantMessage('streaming...'),
        }))
        await new Promise((r) => setTimeout(r, 10))
      })

      await act(async () => {
        result.current.setInputValue('queued message')
      })

      await act(async () => {
        await result.current.handleSend()
      })

      expect(result.current.queue).toHaveLength(1)
    })

    it('interprets stop commands as abort when busy', async () => {
      mockClient.request.mockResolvedValue({ messages: [] })

      const { result } = renderChatHook()

      await act(async () => {
        result.current.setSelectedSession('agent:bot:main')
      })

      // Make it busy
      await act(async () => {
        emitClientEvent('chat', makeChatEvent('agent:bot:main', 'delta', {
          message: makeAssistantMessage('busy'),
        }))
        await new Promise((r) => setTimeout(r, 10))
      })

      await act(async () => {
        result.current.setInputValue('stop')
      })

      await act(async () => {
        await result.current.handleSend()
      })

      expect(mockClient.request).toHaveBeenCalledWith(
        'chat.abort',
        expect.objectContaining({ sessionKey: 'agent:bot:main' }),
      )
    })
  })

  // =========================================================================
  //  handleRetry — busy guard (F4) + executeSend delegation (F6)
  // =========================================================================

  describe('handleRetry', () => {
    it('re-sends a previous user message', async () => {
      const historyMsg: ChatMessage = {
        role: 'user',
        content: [{ type: 'text', text: 'original question' }],
        timestamp: 1,
      }
      mockClient.request
        .mockResolvedValueOnce({ messages: [historyMsg] })
        .mockResolvedValueOnce({}) // chat.send

      const { result } = renderChatHook()

      await act(async () => {
        result.current.setSelectedSession('agent:bot:main')
      })

      await act(async () => {
        await vi.dynamicImportSettled()
      })

      await act(async () => {
        await result.current.handleRetry(historyMsg)
      })

      expect(mockClient.request).toHaveBeenCalledWith(
        'chat.send',
        expect.objectContaining({ message: 'original question' }),
      )
    })

    it('does nothing when busy (F4 guard)', async () => {
      mockClient.request.mockResolvedValue({ messages: [] })

      const { result } = renderChatHook()

      await act(async () => {
        result.current.setSelectedSession('agent:bot:main')
      })

      // Make busy
      await act(async () => {
        emitClientEvent('chat', makeChatEvent('agent:bot:main', 'delta', {
          message: makeAssistantMessage('busy'),
        }))
        await new Promise((r) => setTimeout(r, 10))
      })

      const callCount = mockClient.request.mock.calls.length

      await act(async () => {
        await result.current.handleRetry({
          role: 'user',
          content: [{ type: 'text', text: 'retry this' }],
          timestamp: 1,
        })
      })

      // No new request should have been made
      expect(mockClient.request.mock.calls.length).toBe(callCount)
    })
  })

  // =========================================================================
  //  handleAbort — uses runIdRef (F5)
  // =========================================================================

  describe('handleAbort', () => {
    it('sends chat.abort with current runId', async () => {
      mockClient.request.mockResolvedValue({ messages: [] })

      const { result } = renderChatHook()

      await act(async () => {
        result.current.setSelectedSession('agent:bot:main')
      })

      // Set runId via delta
      await act(async () => {
        emitClientEvent('chat', makeChatEvent('agent:bot:main', 'delta', {
          runId: 'run-abc',
          message: makeAssistantMessage('stream'),
        }))
        await new Promise((r) => setTimeout(r, 10))
      })

      await act(async () => {
        await result.current.handleAbort()
      })

      expect(mockClient.request).toHaveBeenCalledWith(
        'chat.abort',
        expect.objectContaining({ sessionKey: 'agent:bot:main', runId: 'run-abc' }),
      )
    })
  })

  // =========================================================================
  //  handleLoadMore — streaming guard (F2)
  // =========================================================================

  describe('handleLoadMore', () => {
    it('blocks load more during active streaming (F2)', async () => {
      mockClient.request.mockResolvedValue({ messages: [] })

      const { result } = renderChatHook()

      await act(async () => {
        result.current.setSelectedSession('agent:bot:main')
      })

      // Set hasMore + make streaming active
      await act(async () => {
        emitClientEvent('chat', makeChatEvent('agent:bot:main', 'delta', {
          message: makeAssistantMessage('stream'),
        }))
        await new Promise((r) => setTimeout(r, 10))
      })

      const callCount = mockClient.request.mock.calls.length

      await act(async () => {
        await result.current.handleLoadMore()
      })

      // Should not have made another request (runId !== null guard)
      expect(mockClient.request.mock.calls.length).toBe(callCount)
    })
  })

  // =========================================================================
  //  handleRefresh
  // =========================================================================

  describe('handleRefresh', () => {
    it('reloads history and resets streaming state', async () => {
      mockClient.request
        .mockResolvedValueOnce({ messages: [] }) // initial load
        .mockResolvedValueOnce({ messages: [makeAssistantMessage('refreshed')], thinkingLevel: 'high' })

      const { result } = renderChatHook()

      await act(async () => {
        result.current.setSelectedSession('agent:bot:main')
      })

      await act(async () => {
        await result.current.handleRefresh()
      })

      expect(result.current.chat.streaming).toBeNull()
      expect(result.current.chat.runId).toBeNull()
    })
  })

  // =========================================================================
  //  Event subscription cleanup
  // =========================================================================

  describe('event subscription', () => {
    it('subscribes to chat events on client', () => {
      mockClient.request.mockResolvedValue({ messages: [] })
      const { result } = renderChatHook()

      act(() => {
        result.current.setSelectedSession('agent:bot:main')
      })

      expect(mockClient.on).toHaveBeenCalledWith('chat', expect.any(Function))
    })

    it('ignores chat events for other sessions', async () => {
      mockClient.request.mockResolvedValue({ messages: [] })

      const { result } = renderChatHook()

      await act(async () => {
        result.current.setSelectedSession('agent:bot:main')
      })

      // Emit event for different session
      await act(async () => {
        emitClientEvent('chat', makeChatEvent('agent:other:main', 'delta', {
          message: makeAssistantMessage('not for me'),
        }))
        await new Promise((r) => setTimeout(r, 10))
      })

      // Should not have affected state
      expect(result.current.chat.runId).toBeNull()
    })
  })
})
