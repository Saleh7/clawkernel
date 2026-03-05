// ---------------------------------------------------------------------------
//  gateway/client — WebSocket state machine, backoff, request/response
// ---------------------------------------------------------------------------
// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

vi.mock('@/lib/gateway/device-identity', () => ({
  loadOrCreateDeviceIdentity: vi.fn().mockResolvedValue(null),
  signDevicePayload: vi.fn().mockResolvedValue('sig'),
}))

vi.mock('@/lib/gateway/device-auth', () => ({
  buildDeviceAuthPayload: vi.fn().mockReturnValue('payload'),
}))

import { GatewayClient } from '@/lib/gateway/client'

// ---------------------------------------------------------------------------
//  Mock WebSocket
// ---------------------------------------------------------------------------

type WSListener = (ev: unknown) => void

class MockWebSocket {
  static readonly OPEN = 1
  static readonly CLOSED = 3
  static instances: MockWebSocket[] = []

  readyState = MockWebSocket.OPEN
  listeners: Record<string, WSListener[]> = {}
  sent: string[] = []
  closed = false

  constructor(public url: string) {
    MockWebSocket.instances.push(this)
    queueMicrotask(() => this.fire('open', {}))
  }

  addEventListener(event: string, handler: WSListener) {
    if (!this.listeners[event]) this.listeners[event] = []
    this.listeners[event].push(handler)
  }

  send(data: string) { this.sent.push(data) }

  close(code?: number, reason?: string) {
    this.closed = true
    this.readyState = MockWebSocket.CLOSED
    queueMicrotask(() => this.fire('close', { code: code ?? 1000, reason: reason ?? '' }))
  }

  fire(event: string, data: unknown) {
    for (const h of this.listeners[event] ?? []) h(data)
  }

  simulateMessage(payload: unknown) {
    this.fire('message', { data: JSON.stringify(payload) })
  }

  getConnectRequest() {
    for (const raw of this.sent) {
      const parsed = JSON.parse(raw)
      if (parsed.method === 'connect') return parsed
    }
    return null
  }
}

// ---------------------------------------------------------------------------
//  Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  MockWebSocket.instances = []
  vi.stubGlobal('WebSocket', MockWebSocket)
  vi.stubGlobal('localStorage', {
    _store: {} as Record<string, string>,
    getItem(k: string) { return this._store[k] ?? null },
    setItem(k: string, v: string) { this._store[k] = v },
    removeItem(k: string) { delete this._store[k] },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function makeClient(overrides: Record<string, unknown> = {}) {
  return new GatewayClient({ url: 'ws://localhost:4174/ws', token: 'test-token', connectFallbackMs: 0, ...overrides })
}

function lastWs(): MockWebSocket {
  return MockWebSocket.instances[MockWebSocket.instances.length - 1]
}

/** Flush microtask queue */
const tick = () => new Promise((r) => setTimeout(r, 5))

/** Poll until connect request appears or timeout */
async function waitForConnect(ws: MockWebSocket, timeoutMs = 500): Promise<Record<string, unknown>> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const req = ws.getConnectRequest()
    if (req) return req
    await tick()
  }
  throw new Error('Connect request never sent')
}

/** Full connect: start → wait for connect req → hello-ok */
async function fullConnect(client: GatewayClient) {
  client.start()
  await tick()
  const ws = lastWs()
  const req = await waitForConnect(ws)
  ws.simulateMessage({ type: 'res', id: req.id, ok: true, payload: { snapshot: {} } })
  await tick()
  return { ws, req }
}

// ---------------------------------------------------------------------------
//  Tests
// ---------------------------------------------------------------------------

describe('GatewayClient', () => {
  describe('initial state', () => {
    it('starts disconnected', () => {
      const client = makeClient()
      expect(client.state).toBe('disconnected')
      expect(client.connected).toBe(false)
    })
  })

  describe('connection lifecycle', () => {
    it('transitions to connecting → authenticating on start', async () => {
      const states: string[] = []
      const client = makeClient()
      client.on('stateChange', (s) => states.push(s))

      client.start()
      await tick()

      expect(states).toContain('connecting')
      expect(states).toContain('authenticating')

      client.stop()
    })

    it('sends connect request with correct params', async () => {
      const client = makeClient()
      client.start()
      await tick()

      const req = await waitForConnect(lastWs())
      expect(req.method).toBe('connect')
      expect((req.params as Record<string, unknown>).minProtocol).toBe(3)

      client.stop()
    })

    it('sends connect immediately on challenge nonce', async () => {
      const client = makeClient()
      client.start()
      await tick()

      // Send challenge before 750ms fallback
      lastWs().simulateMessage({ type: 'event', event: 'connect.challenge', payload: { nonce: 'abc123' } })

      const req = await waitForConnect(lastWs(), 500) // Should be fast
      expect(req).not.toBeNull()

      client.stop()
    })

    it('transitions to connected on hello-ok', async () => {
      const client = makeClient()
      const readyHandler = vi.fn()
      client.on('ready', readyHandler)

      await fullConnect(client)

      expect(client.state).toBe('connected')
      expect(client.connected).toBe(true)
      expect(readyHandler).toHaveBeenCalled()

      client.stop()
    })

    it('closes connection on connect failure', async () => {
      const client = makeClient()
      client.start()
      await tick()

      const req = await waitForConnect(lastWs())
      lastWs().simulateMessage({ type: 'res', id: req.id, ok: false, error: { message: 'unauthorized' } })
      await tick()

      expect(lastWs().closed).toBe(true)

      client.stop()
    })
  })

  describe('stop', () => {
    it('disconnects and rejects pending requests', async () => {
      const client = makeClient()
      await fullConnect(client)

      const promise = client.request('test.method')
      client.stop()

      await expect(promise).rejects.toThrow('client stopped')
      expect(client.state).toBe('disconnected')
    })
  })

  describe('request/response', () => {
    it('resolves on ok response', async () => {
      const client = makeClient()
      const { ws } = await fullConnect(client)

      const result = client.request('test.echo', { data: 'hello' })
      await tick()

      const echoReq = JSON.parse(ws.sent[ws.sent.length - 1])
      ws.simulateMessage({ type: 'res', id: echoReq.id, ok: true, payload: { echo: 'hello' } })

      await expect(result).resolves.toEqual({ echo: 'hello' })

      client.stop()
    })

    it('rejects on error response', async () => {
      const client = makeClient()
      const { ws } = await fullConnect(client)

      const result = client.request('test.fail')
      await tick()

      const failReq = JSON.parse(ws.sent[ws.sent.length - 1])
      ws.simulateMessage({ type: 'res', id: failReq.id, ok: false, error: { message: 'not found' } })

      await expect(result).rejects.toThrow('not found')

      client.stop()
    })

    it('rejects when not connected', async () => {
      const client = makeClient()
      await expect(client.request('test')).rejects.toThrow('gateway not connected')
    })
  })

  describe('event handling', () => {
    it('emits chat events', async () => {
      const client = makeClient()
      const { ws } = await fullConnect(client)
      const handler = vi.fn()
      client.on('chat', handler)

      ws.simulateMessage({ type: 'event', event: 'chat', payload: { runId: 'r1' }, seq: 1 })
      expect(handler).toHaveBeenCalledWith({ runId: 'r1' })

      client.stop()
    })

    it('emits agent events', async () => {
      const client = makeClient()
      const { ws } = await fullConnect(client)
      const handler = vi.fn()
      client.on('agent', handler)

      ws.simulateMessage({ type: 'event', event: 'agent', payload: { stream: 'tool' }, seq: 2 })
      expect(handler).toHaveBeenCalledWith({ stream: 'tool' })

      client.stop()
    })

    it('emits gap on sequence skip', async () => {
      const client = makeClient()
      const { ws } = await fullConnect(client)
      const gapHandler = vi.fn()
      client.on('gap', gapHandler)

      ws.simulateMessage({ type: 'event', event: 'health', payload: {}, seq: 1 })
      ws.simulateMessage({ type: 'event', event: 'health', payload: {}, seq: 5 })

      expect(gapHandler).toHaveBeenCalledWith({ expected: 2, received: 5 })

      client.stop()
    })

    it('does not emit gap for sequential events', async () => {
      const client = makeClient()
      const { ws } = await fullConnect(client)
      const gapHandler = vi.fn()
      client.on('gap', gapHandler)

      ws.simulateMessage({ type: 'event', event: 'health', payload: {}, seq: 1 })
      ws.simulateMessage({ type: 'event', event: 'health', payload: {}, seq: 2 })

      expect(gapHandler).not.toHaveBeenCalled()

      client.stop()
    })

    it('ignores malformed JSON', async () => {
      const client = makeClient()
      const { ws } = await fullConnect(client)
      const handler = vi.fn()
      client.on('event', handler)

      ws.fire('message', { data: 'not json{{{' })
      expect(handler).not.toHaveBeenCalled()

      client.stop()
    })
  })

  describe('event emitter', () => {
    it('on() returns unsubscribe function', () => {
      const client = makeClient()
      const handler = vi.fn()
      const unsub = client.on('stateChange', handler)

      client.start()
      expect(handler).toHaveBeenCalled()

      handler.mockClear()
      unsub()
      client.stop()
      expect(handler).not.toHaveBeenCalled()
    })

    it('off() removes listener', () => {
      const client = makeClient()
      const handler = vi.fn()
      client.on('stateChange', handler)
      client.off('stateChange', handler)

      client.start()
      expect(handler).not.toHaveBeenCalled()

      client.stop()
    })
  })

  describe('reconnection', () => {
    it('transitions to reconnecting on close', async () => {
      const client = makeClient()
      const states: string[] = []
      client.on('stateChange', (s) => states.push(s))

      client.start()
      await tick()

      lastWs().fire('close', { code: 1006, reason: 'abnormal' })
      await tick()

      expect(states).toContain('reconnecting')

      client.stop()
    })

    it('creates new WebSocket on reconnect', async () => {
      const client = makeClient()
      client.start()
      await tick()

      const firstCount = MockWebSocket.instances.length
      lastWs().fire('close', { code: 1006, reason: '' })

      // backoff 500ms + jitter (~300ms max)
      await new Promise((r) => setTimeout(r, 1000))
      expect(MockWebSocket.instances.length).toBeGreaterThan(firstCount)

      client.stop()
    })

    it('does not reconnect after stop', async () => {
      const client = makeClient()
      client.start()
      await tick()

      client.stop()
      const count = MockWebSocket.instances.length
      await new Promise((r) => setTimeout(r, 1500))
      expect(MockWebSocket.instances.length).toBe(count)
    })
  })

  describe('snapshot', () => {
    it('stores snapshot from hello-ok', async () => {
      const client = makeClient()
      const snapshot = { agents: { list: [] } }

      client.start()
      await tick()
      const req = await waitForConnect(lastWs())
      lastWs().simulateMessage({ type: 'res', id: req.id, ok: true, payload: { snapshot } })
      await tick()

      expect(client.snapshot).toEqual(snapshot)

      client.stop()
    })
  })
})
