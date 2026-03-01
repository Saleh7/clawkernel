/**
 * Resolve live agent status from Gateway sessions + active runs.
 * Shared between /agents and /squad pages.
 */

import { ACTIVE_SESSION_MS } from './session-constants'

export type LiveAgentStatus = 'running' | 'active' | 'idle' | 'inactive'

export const LIVE_STATUS_META: Record<LiveAgentStatus, { label: string; dotClass: string; pulse: boolean }> = {
  running: { label: 'Running', dotClass: 'bg-chart-1', pulse: true },
  active: { label: 'Active', dotClass: 'bg-green-500', pulse: false },
  idle: { label: 'Idle', dotClass: 'bg-yellow-500', pulse: false },
  inactive: { label: 'Inactive', dotClass: 'bg-muted-foreground/30', pulse: false },
}

/** Match session key to agent: must be `agent:<id>:` prefix */
function sessionBelongsToAgent(sessionKey: string, agentId: string): boolean {
  return sessionKey.startsWith(`agent:${agentId}:`)
}

export function resolveLiveStatus(
  agentId: string,
  activeRuns: Record<string, { sessionKey: string; startedAt: number }>,
  sessions: { key: string; updatedAt: number | null }[],
): LiveAgentStatus {
  const hasActiveRun = Object.values(activeRuns).some((r) => sessionBelongsToAgent(r.sessionKey, agentId))
  if (hasActiveRun) return 'running'

  const agentSessions = sessions.filter((s) => sessionBelongsToAgent(s.key, agentId))
  if (agentSessions.length === 0) return 'inactive'

  const now = Date.now()
  const hasRecent = agentSessions.some((s) => s.updatedAt && now - s.updatedAt < ACTIVE_SESSION_MS)
  return hasRecent ? 'active' : 'idle'
}
