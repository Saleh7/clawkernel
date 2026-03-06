import type { AgentIdentityResult, GatewayAgentRow } from '@/lib/gateway/types'
import { ACTIVE_SESSION_MS } from '@/lib/session-constants'

/** Shared type for agent session stats — used by cards view and hierarchy view */
type AgentSessionStats = {
  count: number
  activeCount: number
  tokens: number
  lastActive: number | null
}

/**
 * Compute session statistics for all agents from session list.
 * Used by both cards view and hierarchy view to avoid duplicate computation.
 */
export function computeAgentSessionStats(
  agents: GatewayAgentRow[],
  sessions: Array<{ key: string; totalTokens?: number; updatedAt: number | null }>,
): Map<string, AgentSessionStats> {
  const map = new Map<string, AgentSessionStats>()
  const now = Date.now()

  // Initialize all agents
  for (const agent of agents) {
    map.set(agent.id, { count: 0, activeCount: 0, tokens: 0, lastActive: null })
  }

  // O(sessions) — extract agentId from session key once per session
  for (const session of sessions) {
    if (!session.key.startsWith('agent:')) continue
    const secondColon = session.key.indexOf(':', 6) // after "agent:"
    if (secondColon === -1) continue
    const agentId = session.key.slice(6, secondColon)
    const current = map.get(agentId)
    if (!current) continue
    current.count += 1
    current.tokens += session.totalTokens ?? 0
    if (session.updatedAt && now - session.updatedAt < ACTIVE_SESSION_MS) {
      current.activeCount += 1
    }
    if (session.updatedAt && (current.lastActive === null || session.updatedAt > current.lastActive)) {
      current.lastActive = session.updatedAt
    }
  }

  return map
}

export function normalizeAgentId(name: string): string {
  return name
    .toLowerCase()
    .replaceAll(/[^a-z0-9_-]/g, '-')
    .replaceAll(/-+/g, '-')
    .replaceAll(/(?:^-|-$)/g, '')
}

/** Guard against URLs/paths being rendered as emoji — matches official isLikelyEmoji */
function isLikelyEmoji(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > 16) return false
  let hasNonAscii = false
  for (const ch of trimmed) {
    if ((ch.codePointAt(0) ?? 0) > 127) {
      hasNonAscii = true
      break
    }
  }
  if (!hasNonAscii) return false
  if (trimmed.includes('://') || trimmed.includes('/') || trimmed.includes('.')) return false
  return true
}

export function resolveAgentName(agent: GatewayAgentRow, identity?: AgentIdentityResult | null): string {
  return identity?.name?.trim() || agent.identity?.name?.trim() || agent.name?.trim() || agent.id
}

export function resolveAgentEmoji(agent: GatewayAgentRow, identity?: AgentIdentityResult | null): string {
  // Check emoji fields first, then avatar fields (same order as official)
  const identityEmoji = identity?.emoji?.trim()
  if (identityEmoji && isLikelyEmoji(identityEmoji)) return identityEmoji

  const agentEmoji = agent.identity?.emoji?.trim()
  if (agentEmoji && isLikelyEmoji(agentEmoji)) return agentEmoji

  const identityAvatar = identity?.avatar?.trim()
  if (identityAvatar && isLikelyEmoji(identityAvatar)) return identityAvatar

  const agentAvatar = agent.identity?.avatar?.trim()
  if (agentAvatar && isLikelyEmoji(agentAvatar)) return agentAvatar

  return ''
}

export function formatTokens(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`
  return `${(n / 1_000_000).toFixed(2)}M`
}

export function formatAgo(ms: number | null): string {
  if (!ms) return 'Never'
  const diff = Date.now() - ms
  if (diff < 60_000) return 'Just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

export function shortPath(p: string): string {
  const parts = p.replaceAll('\\', '/').split('/')
  return parts.at(-1) || parts.at(-2) || p
}

export function channelIcon(ch: string): string {
  switch (ch) {
    case 'telegram':
      return '✈️'
    case 'whatsapp':
      return '💬'
    case 'email':
      return '📧'
    case 'discord':
      return '🎮'
    case 'slack':
      return '💼'
    case 'web':
      return '🌐'
    default:
      return '📡'
  }
}

export function resolveModelLabel(model: unknown): string {
  if (!model) return 'unassigned'
  if (typeof model === 'string') return model.trim() || 'unassigned'
  if (typeof model === 'object' && model) {
    const typed = model as { primary?: string; fallbacks?: string[] }
    const primary = typed.primary?.trim()
    if (primary) {
      const fallbackCount = Array.isArray(typed.fallbacks) ? typed.fallbacks.length : 0
      return fallbackCount > 0 ? `${primary} (+${fallbackCount} fallback)` : primary
    }
  }
  return 'unassigned'
}
