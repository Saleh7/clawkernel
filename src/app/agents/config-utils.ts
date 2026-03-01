import type { GatewayClient } from '@/lib/gateway/client'
import type { ConfigSnapshot } from '@/lib/gateway/types'
import { createLogger } from '@/lib/logger'

const log = createLogger('agents:config')

/**
 * Patches a specific agent entry in config and returns the full patched config string.
 * Returns null if the agent is not found in the config list.
 */
function patchAgentConfig(
  config: ConfigSnapshot,
  agentId: string,
  patcher: (entry: Record<string, unknown>) => Record<string, unknown>,
): { raw: string; baseHash: string | null | undefined } | null {
  const current = (config.config as Record<string, unknown>) ?? {}
  const agentsList = [...(((current.agents as Record<string, unknown>)?.list as unknown[]) ?? [])] as Array<
    Record<string, unknown>
  >
  const idx = agentsList.findIndex((a) => a.id === agentId)
  if (idx < 0) return null

  agentsList[idx] = patcher(agentsList[idx])

  const patched = {
    ...current,
    agents: { ...(current.agents as Record<string, unknown>), list: agentsList },
  }

  return {
    raw: JSON.stringify(patched, null, 2),
    baseHash: config.hash,
  }
}

/**
 * Save config with automatic hash-conflict retry.
 * On conflict (stale baseHash), re-fetches config, re-applies the patch, and retries once.
 */
export async function saveConfigWithRetry(
  client: GatewayClient,
  config: ConfigSnapshot,
  agentId: string,
  patcher: (entry: Record<string, unknown>) => Record<string, unknown>,
  method: 'config.set' | 'config.apply',
): Promise<ConfigSnapshot> {
  const result = patchAgentConfig(config, agentId, patcher)
  if (!result) throw new Error('Agent not found in config')

  try {
    await client.request(method, result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : ''
    // Hash conflict — re-fetch and retry once
    if (msg.includes('hash') || msg.includes('conflict') || msg.includes('BASE_HASH')) {
      log.warn('Config hash conflict, retrying with fresh config')
      const freshConfig = await client.request<ConfigSnapshot>('config.get', {})
      const retryResult = patchAgentConfig(freshConfig, agentId, patcher)
      if (!retryResult) throw new Error('Agent not found in refreshed config')
      await client.request(method, retryResult)
      return await client.request<ConfigSnapshot>('config.get', {})
    }
    throw err
  }

  return await client.request<ConfigSnapshot>('config.get', {})
}

/**
 * Save a raw config patch with automatic hash-conflict retry.
 * Unlike `saveConfigWithRetry`, this patches the full config object (not a single agent entry).
 */
export async function saveRawConfigWithRetry(
  client: GatewayClient,
  config: ConfigSnapshot,
  patcher: (current: Record<string, unknown>) => Record<string, unknown>,
  method: 'config.set' | 'config.apply' = 'config.set',
): Promise<ConfigSnapshot> {
  const current = (config.config ?? {}) as Record<string, unknown>
  const patched = patcher(current)

  try {
    await client.request(method, { raw: JSON.stringify(patched, null, 2), baseHash: config.hash })
  } catch (err) {
    const msg = err instanceof Error ? err.message : ''
    if (msg.includes('hash') || msg.includes('conflict') || msg.includes('BASE_HASH')) {
      log.warn('Config hash conflict, retrying with fresh config')
      const freshConfig = await client.request<ConfigSnapshot>('config.get', {})
      const freshCurrent = (freshConfig.config ?? {}) as Record<string, unknown>
      const freshPatched = patcher(freshCurrent)
      await client.request(method, { raw: JSON.stringify(freshPatched, null, 2), baseHash: freshConfig.hash })
      return await client.request<ConfigSnapshot>('config.get', {})
    }
    throw err
  }

  return await client.request<ConfigSnapshot>('config.get', {})
}
