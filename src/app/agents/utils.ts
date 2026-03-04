import type { AgentIdentityResult, GatewayAgentRow } from '@/lib/gateway/types'

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
