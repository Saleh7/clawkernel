// ---------------------------------------------------------------------------
//  GatewayClient — persistent WebSocket connection to OpenClaw Gateway
//
//  Matches OpenClaw Control UI's GatewayBrowserClient protocol behavior:
//  - Protocol v3 with connect.challenge nonce
//  - Ed25519 device identity + device token persistence
//  - Exponential backoff with jitter
//  - Request timeout with automatic cleanup
//  - Connection state machine
//  - Sequence gap detection
// ---------------------------------------------------------------------------

import { createLogger } from '@/lib/logger'
import type {
  ConnectionState,
  GatewayClientOptions,
  GatewayEventFrame,
  GatewayHelloOk,
  GatewayResponseFrame,
  GatewaySnapshot,
} from './types'

// ---------------------------------------------------------------------------
//  Constants
// ---------------------------------------------------------------------------

const MIN_BACKOFF_MS = 500
const MAX_BACKOFF_MS = 15_000
const BACKOFF_MULTIPLIER = 1.7
const JITTER_MAX = 300
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000

// Fallback delay before sending connect if no challenge nonce arrives.
// Matches OpenClaw UI's 750ms. If connect.challenge arrives first, the
// timer is cancelled and connect is sent immediately with the nonce.
const CONNECT_FALLBACK_DELAY_MS = 750

// Close code used when connect handshake fails (browser rejects 1008)
const CONNECT_FAILED_CLOSE_CODE = 4008

// ---------------------------------------------------------------------------
//  Device auth token persistence (matches OpenClaw UI's device-auth.ts)
// ---------------------------------------------------------------------------

const DEVICE_AUTH_STORAGE_KEY = 'clawkernel.device.auth.v1'

type DeviceAuthEntry = { token: string; role: string; scopes: string[]; updatedAtMs: number }
type DeviceAuthStore = { version: 1; deviceId: string; tokens: Record<string, DeviceAuthEntry> }

type NavigatorWithUAData = Navigator & {
  userAgentData?: {
    platform?: string
  }
}

function loadDeviceAuthToken(deviceId: string, role: string): string | null {
  try {
    const raw = localStorage.getItem(DEVICE_AUTH_STORAGE_KEY)
    if (!raw) return null
    const store = JSON.parse(raw) as DeviceAuthStore
    if (store?.version !== 1 || store.deviceId !== deviceId) return null
    return store.tokens[role]?.token ?? null
  } catch {
    return null
  }
}

function storeDeviceAuthToken(deviceId: string, role: string, token: string, scopes: string[]): void {
  try {
    const raw = localStorage.getItem(DEVICE_AUTH_STORAGE_KEY)
    let store: DeviceAuthStore = { version: 1, deviceId, tokens: {} }
    if (raw) {
      const parsed = JSON.parse(raw) as DeviceAuthStore
      if (parsed?.version === 1 && parsed.deviceId === deviceId) {
        store = parsed
      }
    }
    store.tokens[role] = { token, role, scopes, updatedAtMs: Date.now() }
    localStorage.setItem(DEVICE_AUTH_STORAGE_KEY, JSON.stringify(store))
  } catch {}
}

function clearDeviceAuthToken(deviceId: string, role: string): void {
  try {
    const raw = localStorage.getItem(DEVICE_AUTH_STORAGE_KEY)
    if (!raw) return
    const store = JSON.parse(raw) as DeviceAuthStore
    if (store?.version !== 1 || store.deviceId !== deviceId) return
    delete store.tokens[role]
    localStorage.setItem(DEVICE_AUTH_STORAGE_KEY, JSON.stringify(store))
  } catch {}
}

function getBrowserNavigator(): NavigatorWithUAData | null {
  if (typeof navigator === 'object') {
    return navigator as NavigatorWithUAData
  }
  return null
}

function resolveClientPlatform(nav: NavigatorWithUAData | null): string {
  const platform = nav?.userAgentData?.platform
  if (typeof platform === 'string' && platform) return platform
  return 'web'
}

function resolveUserAgent(nav: NavigatorWithUAData | null): string | undefined {
  return nav?.userAgent
}

function resolveLocale(nav: NavigatorWithUAData | null): string | undefined {
  return nav?.language
}

// ---------------------------------------------------------------------------
//  Pending request tracking
// ---------------------------------------------------------------------------

type PendingRequest = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

// ---------------------------------------------------------------------------
//  Event emitter types
// ---------------------------------------------------------------------------

type GatewayClientEvents = {
  /** Connection state changed */
  stateChange: (state: ConnectionState) => void
  /** Authenticated and ready — snapshot from hello-ok */
  ready: (hello: GatewayHelloOk) => void
  /** Gateway event received */
  event: (frame: GatewayEventFrame) => void
  /** Chat-specific event (filtered from event stream) */
  chat: (payload: unknown) => void
  /** Agent-specific event (tool stream, compaction, etc.) */
  agent: (payload: unknown) => void
  /** Connection closed (will auto-reconnect unless stopped) */
  close: (info: { code: number; reason: string }) => void
  /** Sequence gap detected — may need to refresh state */
  gap: (info: { expected: number; received: number }) => void
  /** Unrecoverable error */
  error: (error: Error) => void
}

type EventName = keyof GatewayClientEvents
type EventCallback<TKey extends EventName> = GatewayClientEvents[TKey]

function uuid(): string {
  return crypto.randomUUID()
}

function secureRandomUnit(): number {
  if (typeof crypto !== 'object' || typeof crypto.getRandomValues !== 'function') {
    return Math.random()
  }
  const values = new Uint32Array(1)
  crypto.getRandomValues(values)
  return values[0] / (0xffffffff + 1)
}

const log = createLogger('gateway:client')

export class GatewayClient {
  // -- Config ---------------------------------------------------------------
  private readonly opts: GatewayClientOptions & {
    clientName: string
    clientVersion: string
    instanceId: string
  }

  // -- WebSocket ------------------------------------------------------------
  private ws: WebSocket | null = null
  private stopped = true

  // -- Connection state -----------------------------------------------------
  private _state: ConnectionState = 'disconnected'
  private backoffMs = MIN_BACKOFF_MS
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private connectTimer: ReturnType<typeof setTimeout> | null = null

  // -- Request/response -----------------------------------------------------
  private readonly pending = new Map<string, PendingRequest>()
  private connectSent = false
  private connectNonce: string | null = null

  // -- Event sequencing -----------------------------------------------------
  private lastSeq: number | null = null

  // -- Event listeners ------------------------------------------------------
  // biome-ignore lint/complexity/noBannedTypes: generic event emitter requires Function
  private readonly listeners = new Map<EventName, Set<Function>>()

  // -- Public state ---------------------------------------------------------
  public snapshot: GatewaySnapshot | null = null
  public hello: GatewayHelloOk | null = null

  constructor(options: GatewayClientOptions) {
    this.opts = {
      ...options,
      clientName: options.clientName ?? 'webchat-ui',
      clientVersion: options.clientVersion ?? 'dev',
      instanceId: options.instanceId ?? uuid(),
    }
  }

  // =========================================================================
  //  Public API
  // =========================================================================

  get state(): ConnectionState {
    return this._state
  }

  get connected(): boolean {
    return this._state === 'connected'
  }

  start(): void {
    if (!this.stopped) return
    this.stopped = false
    this.connect()
  }

  stop(): void {
    this.stopped = true
    this.clearTimers()
    if (this.ws) {
      this.ws.close(1000, 'client stopped')
      this.ws = null
    }
    this.flushPending(new Error('client stopped'))
    this.setState('disconnected')
  }

  async request<T = unknown>(method: string, params?: unknown, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS): Promise<T> {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      throw new Error('gateway not connected')
    }

    const id = uuid()
    const frame = { type: 'req' as const, id, method, params }

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`request "${method}" timed out after ${timeoutMs}ms`))
      }, timeoutMs)

      this.pending.set(id, {
        resolve: (v) => resolve(v as T),
        reject,
        timer,
      })

      this.ws!.send(JSON.stringify(frame))
    })
  }

  // =========================================================================
  //  Event emitter
  // =========================================================================

  on<TKey extends EventName>(event: TKey, callback: EventCallback<TKey>): () => void {
    let set = this.listeners.get(event)
    if (!set) {
      set = new Set()
      this.listeners.set(event, set)
    }
    set.add(callback)
    return () => {
      set.delete(callback)
    }
  }

  off<TKey extends EventName>(event: TKey, callback: EventCallback<TKey>): void {
    this.listeners.get(event)?.delete(callback)
  }

  private emit<TKey extends EventName>(event: TKey, ...args: Parameters<EventCallback<TKey>>): void {
    const set = this.listeners.get(event)
    if (!set) return
    for (const cb of set) {
      try {
        cb(...args)
      } catch (err) {
        log.error(`Listener error on "${event}"`, err)
      }
    }
  }

  // =========================================================================
  //  Connection lifecycle
  // =========================================================================

  private connect(): void {
    if (this.stopped) return

    this.setState('connecting')
    this.connectSent = false
    this.connectNonce = null
    this.lastSeq = null

    try {
      this.ws = new WebSocket(this.opts.url)
    } catch (err) {
      this.emit('error', err instanceof Error ? err : new Error(String(err)))
      this.scheduleReconnect()
      return
    }

    this.ws.addEventListener('open', this.onOpen)
    this.ws.addEventListener('message', this.onMessage)
    this.ws.addEventListener('close', this.onClose)
    this.ws.addEventListener('error', () => {
      // Close handler will fire — nothing extra needed
    })
  }

  private readonly onOpen = (): void => {
    this.setState('authenticating')
    // Queue a fallback connect after 750ms. If the gateway sends a
    // connect.challenge event first, the timer is cancelled and connect
    // is sent immediately with the nonce (matching OpenClaw UI behavior).
    this.connectNonce = null
    this.connectSent = false
    if (this.connectTimer !== null) {
      clearTimeout(this.connectTimer)
    }
    this.connectTimer = setTimeout(() => {
      this.connectTimer = null
      void this.sendConnect()
    }, this.opts.connectFallbackMs ?? CONNECT_FALLBACK_DELAY_MS)
  }

  private readonly onClose = (ev: CloseEvent): void => {
    this.ws = null
    this.flushPending(new Error(`gateway closed (${ev.code}): ${ev.reason}`))
    this.emit('close', { code: ev.code, reason: ev.reason })
    this.scheduleReconnect()
  }

  private readonly onMessage = (ev: MessageEvent): void => {
    let parsed: unknown
    try {
      parsed = JSON.parse(String(ev.data ?? ''))
    } catch {
      return
    }

    const frame = parsed as { type?: string }

    if (frame.type === 'event') {
      const evt = parsed as GatewayEventFrame
      if (evt.event === 'connect.challenge') {
        const nonce = (evt.payload as { nonce?: string })?.nonce
        if (typeof nonce === 'string' && nonce) {
          this.connectNonce = nonce
          // Cancel fallback timer and send connect immediately with nonce
          if (this.connectTimer !== null) {
            clearTimeout(this.connectTimer)
            this.connectTimer = null
          }
          void this.sendConnect()
        }
        return
      }
      this.handleEvent(evt)
      return
    }

    if (frame.type === 'res') {
      this.handleResponse(parsed as GatewayResponseFrame)
    }
  }

  // =========================================================================
  //  Connect handshake
  // =========================================================================

  private async sendConnect(): Promise<void> {
    if (this.connectSent || this.ws?.readyState !== WebSocket.OPEN) return
    this.connectSent = true

    if (this.connectTimer !== null) {
      clearTimeout(this.connectTimer)
      this.connectTimer = null
    }

    const role = 'operator'
    const scopes = ['operator.admin', 'operator.approvals', 'operator.pairing']
    const isSecure = typeof crypto !== 'undefined' && !!crypto.subtle

    // Resolve auth token: prefer stored device token, fall back to shared token
    let deviceIdentity: { deviceId: string; publicKey: string; privateKey: string } | null = null
    let authToken = this.opts.token || undefined
    let canFallbackToShared = false

    if (isSecure) {
      try {
        const { loadOrCreateDeviceIdentity } = await import('./device-identity')
        deviceIdentity = await loadOrCreateDeviceIdentity()
        const storedToken = loadDeviceAuthToken(deviceIdentity.deviceId, role)
        if (storedToken) {
          canFallbackToShared = Boolean(this.opts.token)
          authToken = storedToken
        }
      } catch (err) {
        log.warn('Device identity failed, falling back to token-only', err)
      }
    }

    // Build device auth (only if we have identity AND a nonce)
    let device: { id: string; publicKey: string; signature: string; signedAt: number; nonce: string } | undefined

    if (isSecure && deviceIdentity && this.connectNonce) {
      try {
        const { signDevicePayload } = await import('./device-identity')
        const { buildDeviceAuthPayload } = await import('./device-auth')
        const signedAtMs = Date.now()
        const payload = buildDeviceAuthPayload({
          deviceId: deviceIdentity.deviceId,
          clientId: 'openclaw-control-ui',
          clientMode: 'webchat',
          role,
          scopes,
          signedAtMs,
          token: authToken ?? null,
          nonce: this.connectNonce,
        })
        const signature = await signDevicePayload(deviceIdentity.privateKey, payload)
        device = {
          id: deviceIdentity.deviceId,
          publicKey: deviceIdentity.publicKey,
          signature,
          signedAt: signedAtMs,
          nonce: this.connectNonce,
        }
      } catch (err) {
        log.warn('Device auth signing failed', err)
      }
    }

    const nav = getBrowserNavigator()

    const params = {
      minProtocol: 3,
      maxProtocol: 3,
      client: {
        id: 'openclaw-control-ui',
        displayName: 'WebClaw',
        version: this.opts.clientVersion,
        platform: resolveClientPlatform(nav),
        mode: 'webchat',
        instanceId: this.opts.instanceId,
      },
      role,
      scopes,
      device,
      caps: [],
      auth: {
        token: authToken,
        password: this.opts.password || undefined,
      },
      userAgent: resolveUserAgent(nav),
      locale: resolveLocale(nav),
    }

    this.request<GatewayHelloOk>('connect', params, 10_000)
      .then((hello) => {
        // Store device token for future reconnections
        if (hello.auth?.deviceToken && deviceIdentity) {
          storeDeviceAuthToken(
            deviceIdentity.deviceId,
            hello.auth.role ?? role,
            hello.auth.deviceToken,
            hello.auth.scopes ?? [],
          )
        }
        this.backoffMs = MIN_BACKOFF_MS
        this.hello = hello
        this.snapshot = hello.snapshot ?? null
        this.setState('connected')
        this.emit('ready', hello)
      })
      .catch((err) => {
        // If device token failed, clear it and retry with shared token
        if (canFallbackToShared && deviceIdentity) {
          clearDeviceAuthToken(deviceIdentity.deviceId, role)
        }
        this.emit('error', err instanceof Error ? err : new Error(String(err)))
        this.ws?.close(CONNECT_FAILED_CLOSE_CODE, 'connect failed')
      })
  }

  // =========================================================================
  //  Event handling
  // =========================================================================

  private handleEvent(evt: GatewayEventFrame): void {
    const seq = typeof evt.seq === 'number' ? evt.seq : null
    if (seq !== null) {
      if (this.lastSeq !== null && seq > this.lastSeq + 1) {
        this.emit('gap', { expected: this.lastSeq + 1, received: seq })
      }
      this.lastSeq = seq
    }

    this.emit('event', evt)

    if (evt.event === 'chat') {
      this.emit('chat', evt.payload)
    }
    if (evt.event === 'agent') {
      this.emit('agent', evt.payload)
    }
  }

  // =========================================================================
  //  Response handling
  // =========================================================================

  private handleResponse(res: GatewayResponseFrame): void {
    const pending = this.pending.get(res.id)
    if (!pending) return

    this.pending.delete(res.id)
    clearTimeout(pending.timer)

    if (res.ok) {
      pending.resolve(res.payload)
    } else {
      pending.reject(new Error(res.error?.message ?? 'request failed'))
    }
  }

  // =========================================================================
  //  Reconnection
  // =========================================================================

  private scheduleReconnect(): void {
    if (this.stopped) {
      this.setState('disconnected')
      return
    }

    this.setState('reconnecting')

    const jitter = secureRandomUnit() * JITTER_MAX
    const delay = this.backoffMs + jitter
    this.backoffMs = Math.min(this.backoffMs * BACKOFF_MULTIPLIER, MAX_BACKOFF_MS)

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, delay)
  }

  // =========================================================================
  //  State management
  // =========================================================================

  private setState(state: ConnectionState): void {
    if (this._state === state) return
    this._state = state
    this.emit('stateChange', state)
  }

  // =========================================================================
  //  Cleanup
  // =========================================================================

  private flushPending(error: Error): void {
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }
    this.pending.clear()
  }

  private clearTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.connectTimer) {
      clearTimeout(this.connectTimer)
      this.connectTimer = null
    }
  }
}
