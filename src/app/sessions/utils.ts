import type { GatewaySessionRow } from '@/lib/gateway/types'
import { ACTIVE_SESSION_MS } from '@/lib/session-constants'
import type { SessionTreeNode } from './types'

export { formatRelativeTime, formatTokens } from '@/lib/format'

export const DISPLAY_PAGE_SIZE = 50

export function extractAgentId(key: string): string {
  const match = key.match(/^agent:([^:]+):/)
  return match?.[1] ?? 'unknown'
}

export function getDisplayName(s: GatewaySessionRow): string {
  return s.displayName || s.label || s.key.split(':').pop() || s.key
}

export function isActive(s: GatewaySessionRow): boolean {
  return !!s.updatedAt && Date.now() - s.updatedAt < ACTIVE_SESSION_MS
}

export function buildSessionTree(sessions: GatewaySessionRow[]): SessionTreeNode[] {
  const keySet = new Set(sessions.map((s) => s.key))
  const roots: SessionTreeNode[] = []
  const nodeMap = new Map<string, SessionTreeNode>()

  for (const s of sessions) {
    nodeMap.set(s.key, { session: s, children: [], depth: 0 })
  }

  for (const s of sessions) {
    const parts = s.key.split(':')
    let parentKey: string | null = null

    if (parts.length > 3) {
      const agentId = parts[1]
      const mainKey = `agent:${agentId}:main`
      if (s.key !== mainKey && keySet.has(mainKey)) {
        parentKey = mainKey
      }
    }

    const node = nodeMap.get(s.key)
    if (!node) continue

    if (parentKey && nodeMap.has(parentKey)) {
      const parent = nodeMap.get(parentKey)
      if (parent) {
        node.depth = parent.depth + 1
        parent.children.push(node)
      }
    } else {
      roots.push(node)
    }
  }

  return roots
}
