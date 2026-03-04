import type { GatewaySessionRow } from '@/lib/gateway/types'
import { ACTIVE_SESSION_MS } from '@/lib/session-constants'
import type { SessionTreeNode } from './types'

export { formatRelativeTime, formatTokens } from '@/lib/format'

export const DISPLAY_PAGE_SIZE = 50

const AGENT_KEY_RE = /^agent:([^:]+):/

export function extractAgentId(key: string): string {
  const match = AGENT_KEY_RE.exec(key)
  return match?.[1] ?? 'unknown'
}

export function sessionLabel(key: string): string {
  const p = key.split(':')
  return p.length > 2 ? p.slice(2).join(':') : key
}

export function getDisplayName(s: GatewaySessionRow): string {
  return s.displayName || s.label || s.key.split(':').pop() || s.key
}

export function isActive(s: GatewaySessionRow): boolean {
  return !!s.updatedAt && Date.now() - s.updatedAt < ACTIVE_SESSION_MS
}

function findParentKey(s: GatewaySessionRow, keySet: Set<string>): string | null {
  const parts = s.key.split(':')
  if (parts.length <= 3) return null
  const mainKey = `agent:${parts[1]}:main`
  return s.key !== mainKey && keySet.has(mainKey) ? mainKey : null
}

export function buildSessionTree(sessions: GatewaySessionRow[]): SessionTreeNode[] {
  const keySet = new Set(sessions.map((s) => s.key))
  const roots: SessionTreeNode[] = []
  const nodeMap = new Map<string, SessionTreeNode>()

  for (const s of sessions) {
    nodeMap.set(s.key, { session: s, children: [], depth: 0 })
  }

  for (const s of sessions) {
    const parentKey = findParentKey(s, keySet)
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
