/**
 * Shared gateway operations for sessions.
 * Centralizes endpoint names, payload shapes, and store updates.
 */

import { useGatewayStore } from '@/stores/gateway-store'
import type { GatewayClient } from './gateway/client'
import type { SessionsListResult } from './gateway/types'

/**
 * Fetches the session list from the gateway and syncs it to the store.
 * Excludes global and unknown sessions by default.
 */
export async function refreshSessions(client: GatewayClient, opts?: { limit?: number }): Promise<void> {
  const r = await client.request<SessionsListResult>('sessions.list', {
    includeGlobal: false,
    includeUnknown: false,
    ...(opts?.limit && opts.limit > 0 ? { limit: opts.limit } : {}),
  })
  useGatewayStore.getState().setSessions(r.sessions, r.defaults)
}

/**
 * Deletes a single session and its transcript from the gateway.
 */
export async function deleteSession(client: GatewayClient, key: string): Promise<void> {
  await client.request('sessions.delete', { key, deleteTranscript: true })
}
