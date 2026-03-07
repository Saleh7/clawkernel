import type { GatewayClient } from '@/lib/gateway/client'
import type { ConfigSnapshot } from '@/lib/gateway/types'
import { createLogger } from '@/lib/logger'

const log = createLogger('agents:config')

/**
 * Returns true if the error is a config hash conflict from the Gateway.
 *
 * OpenClaw gateway emits three distinct messages for hash-related rejections
 * (verified against server-methods/config.ts → requireConfigBaseHash):
 *
 *   "config base hash unavailable; re-run config.get and retry"  (hash field missing in snapshot)
 *   "config base hash required; re-run config.get and retry"     (baseHash param missing)
 *   "config changed since last load; re-run config.get and retry" (baseHash !== snapshotHash)
 *
 * The first two contain the word "hash".
 * The third does NOT — which is why the original check was incomplete.
 * All three contain "re-run config.get", used here as the canonical signal.
 */
function isHashConflict(msg: string): boolean {
  return (
    msg.includes('hash') || msg.includes('conflict') || msg.includes('BASE_HASH') || msg.includes('re-run config.get')
  )
}

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
    if (isHashConflict(msg)) {
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
  const current = config.config ?? {}
  const patched = patcher(current)

  try {
    await client.request(method, { raw: JSON.stringify(patched, null, 2), baseHash: config.hash })
  } catch (err) {
    const msg = err instanceof Error ? err.message : ''
    if (isHashConflict(msg)) {
      log.warn('Config hash conflict, retrying with fresh config')
      const freshConfig = await client.request<ConfigSnapshot>('config.get', {})
      const freshCurrent = freshConfig.config ?? {}
      const freshPatched = patcher(freshCurrent)
      await client.request(method, { raw: JSON.stringify(freshPatched, null, 2), baseHash: freshConfig.hash })
      return await client.request<ConfigSnapshot>('config.get', {})
    }
    throw err
  }

  return await client.request<ConfigSnapshot>('config.get', {})
}

/**
 * Send config.patch with automatic hash-conflict retry.
 *
 * config.patch applies a JSON Merge Patch (diff only) to the current config.
 * Unlike config.set / config.apply, the same `raw` diff can safely be retried
 * against the latest config — channel enable/disable and policy patches are
 * always idempotent.
 *
 * On hash conflict ("config changed since last load"), re-fetches the latest
 * config to obtain a fresh baseHash and retries the patch exactly once.
 *
 * The caller is responsible for updating the gateway store and calling
 * channels.status / onRefresh after this function returns.
 *
 * @param client       - Connected GatewayClient
 * @param config       - Current config snapshot (provides baseHash)
 * @param raw          - JSON string of the merge-patch diff
 * @param restartDelayMs - Optional restart delay passed to the gateway
 */
export async function patchConfigWithRetry(
  client: GatewayClient,
  config: ConfigSnapshot,
  raw: string,
  restartDelayMs?: number,
): Promise<void> {
  const buildParams = (hash: string | null | undefined) => ({
    raw,
    ...(hash ? { baseHash: hash } : {}),
    ...(restartDelayMs === undefined ? {} : { restartDelayMs }),
  })

  try {
    await client.request('config.patch', buildParams(config.hash))
  } catch (err) {
    const msg = err instanceof Error ? err.message : ''
    if (isHashConflict(msg)) {
      log.warn('config.patch hash conflict, retrying with fresh config')
      const fresh = await client.request<ConfigSnapshot>('config.get', {})
      await client.request('config.patch', buildParams(fresh.hash))
      return
    }
    throw err
  }
}
