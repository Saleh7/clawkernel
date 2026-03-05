// ---------------------------------------------------------------------------
//  agents/config-utils — Config save/patch with hash-conflict retry
// ---------------------------------------------------------------------------

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ConfigSnapshot } from '@/lib/gateway/types'

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

const { saveConfigWithRetry, saveRawConfigWithRetry, patchConfigWithRetry } = await import(
  '@/app/agents/config-utils'
)

function makeConfig(agents: Record<string, unknown>[] = [], hash = 'h1'): ConfigSnapshot {
  return {
    config: { agents: { list: agents } },
    hash,
    raw: '',
  } as unknown as ConfigSnapshot
}

function mockClient(overrides: Record<string, unknown> = {}) {
  return { request: vi.fn().mockResolvedValue({}), ...overrides } as ReturnType<typeof vi.fn> & {
    request: ReturnType<typeof vi.fn>
  }
}

afterEach(() => vi.restoreAllMocks())

// ===========================================================================
//  saveConfigWithRetry
// ===========================================================================

describe('saveConfigWithRetry', () => {
  it('patches agent and saves config', async () => {
    const config = makeConfig([{ id: 'bot', name: 'Bot' }])
    const client = mockClient({ request: vi.fn().mockResolvedValue(config) })
    const patcher = (e: Record<string, unknown>) => ({ ...e, name: 'New' })

    await saveConfigWithRetry(client, config, 'bot', patcher, 'config.set')

    expect(client.request).toHaveBeenCalledWith('config.set', expect.objectContaining({ baseHash: 'h1' }))
  })

  it('throws when agent not found', async () => {
    const config = makeConfig([{ id: 'other' }])
    const client = mockClient()

    await expect(
      saveConfigWithRetry(client, config, 'bot', (e) => e, 'config.set'),
    ).rejects.toThrow('Agent not found in config')
  })

  it('retries on hash conflict', async () => {
    const config = makeConfig([{ id: 'bot' }])
    const freshConfig = makeConfig([{ id: 'bot' }], 'h2')

    const client = mockClient({
      request: vi
        .fn()
        .mockRejectedValueOnce(new Error('config changed since last load; re-run config.get and retry'))
        .mockResolvedValueOnce(freshConfig) // config.get
        .mockResolvedValueOnce({}) // retry config.set
        .mockResolvedValueOnce(freshConfig), // final config.get
    })

    const result = await saveConfigWithRetry(client, config, 'bot', (e) => e, 'config.set')
    expect(client.request).toHaveBeenCalledTimes(4)
    expect(result).toBe(freshConfig)
  })

  it('throws non-conflict errors', async () => {
    const config = makeConfig([{ id: 'bot' }])
    const client = mockClient({
      request: vi.fn().mockRejectedValue(new Error('Network error')),
    })

    await expect(
      saveConfigWithRetry(client, config, 'bot', (e) => e, 'config.set'),
    ).rejects.toThrow('Network error')
  })
})

// ===========================================================================
//  saveRawConfigWithRetry
// ===========================================================================

describe('saveRawConfigWithRetry', () => {
  it('saves raw config', async () => {
    const config = makeConfig([], 'h1')
    const client = mockClient({ request: vi.fn().mockResolvedValue(config) })

    await saveRawConfigWithRetry(client, config, (c) => ({ ...c, key: 'value' }))

    expect(client.request).toHaveBeenCalledWith(
      'config.set',
      expect.objectContaining({ baseHash: 'h1' }),
    )
  })

  it('retries on hash conflict with re-run config.get message', async () => {
    const config = makeConfig([], 'h1')
    const fresh = makeConfig([], 'h2')

    const client = mockClient({
      request: vi
        .fn()
        .mockRejectedValueOnce(new Error('base hash required; re-run config.get and retry'))
        .mockResolvedValueOnce(fresh)
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce(fresh),
    })

    await saveRawConfigWithRetry(client, config, (c) => c)
    expect(client.request).toHaveBeenCalledTimes(4)
  })
})

// ===========================================================================
//  patchConfigWithRetry
// ===========================================================================

describe('patchConfigWithRetry', () => {
  it('sends config.patch with hash and restartDelayMs', async () => {
    const config = makeConfig([], 'h1')
    const client = mockClient()

    await patchConfigWithRetry(client, config, '{"enabled":true}', 2000)

    expect(client.request).toHaveBeenCalledWith('config.patch', {
      raw: '{"enabled":true}',
      baseHash: 'h1',
      restartDelayMs: 2000,
    })
  })

  it('omits restartDelayMs when undefined', async () => {
    const config = makeConfig([], 'h1')
    const client = mockClient()

    await patchConfigWithRetry(client, config, '{}')

    const args = client.request.mock.calls[0][1]
    expect(args).not.toHaveProperty('restartDelayMs')
  })

  it('retries on hash conflict', async () => {
    const config = makeConfig([], 'h1')
    const fresh = makeConfig([], 'h2')

    const client = mockClient({
      request: vi
        .fn()
        .mockRejectedValueOnce(new Error('hash mismatch'))
        .mockResolvedValueOnce(fresh) // config.get
        .mockResolvedValueOnce({}), // retry config.patch
    })

    await patchConfigWithRetry(client, config, '{}')
    expect(client.request).toHaveBeenCalledTimes(3)
  })

  it('throws non-conflict errors', async () => {
    const config = makeConfig([], 'h1')
    const client = mockClient({
      request: vi.fn().mockRejectedValue(new Error('Forbidden')),
    })

    await expect(patchConfigWithRetry(client, config, '{}')).rejects.toThrow('Forbidden')
  })

  it('omits baseHash when config.hash is null', async () => {
    const config = makeConfig([], null as unknown as string)
    const client = mockClient()

    await patchConfigWithRetry(client, config, '{}')

    const args = client.request.mock.calls[0][1]
    expect(args).not.toHaveProperty('baseHash')
  })
})
