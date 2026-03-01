import type { GatewaySessionRow } from '@/lib/gateway/types'

export type SortField = 'updated' | 'tokens' | 'name'
export type SortDir = 'asc' | 'desc'
export type KindFilter = 'all' | 'direct' | 'group'
export type ViewMode = 'flat' | 'grouped' | 'tree'
export type QuickFilter = 'none' | 'active' | 'highUsage' | 'stale'

export type BulkDeleteResult = {
  deletedKeys: string[]
  failedKeys: string[]
}

export type SessionTreeNode = {
  session: GatewaySessionRow
  children: SessionTreeNode[]
  depth: number
}
