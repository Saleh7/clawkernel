import { Button } from '@/components/ui/button'
import type { GatewaySessionRow } from '@/lib/gateway/types'
import type { SessionTreeNode, ViewMode } from '../types'
import { DISPLAY_PAGE_SIZE } from '../utils'
import { AgentGroup } from './agent-group'
import { EmptyState } from './empty-state'
import { SessionTreeItem } from './session-tree-item'

export function SessionsList({
  filtered,
  visibleSessions,
  viewMode,
  treeRoots,
  grouped,
  renderCard,
  hasMoreSessions,
  remainingSessions,
  onShowMore,
  onShowAll,
  isFiltered,
}: {
  filtered: GatewaySessionRow[]
  visibleSessions: GatewaySessionRow[]
  viewMode: ViewMode
  treeRoots: SessionTreeNode[] | null
  grouped: Array<[string, GatewaySessionRow[]]> | null
  renderCard: (session: GatewaySessionRow) => React.ReactNode
  hasMoreSessions: boolean
  remainingSessions: number
  onShowMore: () => void
  onShowAll: () => void
  isFiltered: boolean
}) {
  if (filtered.length === 0) {
    return <EmptyState filtered={isFiltered} />
  }

  return (
    <>
      {viewMode === 'flat' ? (
        <div className="relative isolate space-y-2">{visibleSessions.map(renderCard)}</div>
      ) : viewMode === 'tree' ? (
        <div className="space-y-1">
          {treeRoots?.map((node) => (
            <SessionTreeItem key={node.session.key} node={node} renderCard={renderCard} />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {grouped?.map(([agent, agentSessions]) => (
            <AgentGroup key={agent} agent={agent} sessions={agentSessions} renderCard={renderCard} />
          ))}
        </div>
      )}

      {hasMoreSessions && (
        <div className="flex flex-wrap items-center justify-center gap-2 pt-3">
          <Button size="sm" variant="outline" onClick={onShowMore}>
            Show {Math.min(DISPLAY_PAGE_SIZE, remainingSessions)} more ({remainingSessions} remaining)
          </Button>
          <Button size="sm" variant="ghost" onClick={onShowAll}>
            Show all ({filtered.length})
          </Button>
        </div>
      )}
    </>
  )
}
