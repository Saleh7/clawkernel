import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import type { GatewaySessionRow } from '@/lib/gateway/types'
import type { SessionTreeNode } from '../types'

export function SessionTreeItem({
  node,
  renderCard,
  defaultExpanded,
}: {
  readonly node: SessionTreeNode
  readonly renderCard: (s: GatewaySessionRow) => React.ReactNode
  readonly defaultExpanded?: boolean
}) {
  const [expanded, setExpanded] = useState(defaultExpanded ?? true)

  return (
    <div>
      <div className="flex items-start gap-1" style={{ paddingLeft: `${node.depth * 24}px` }}>
        {node.children.length > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="mt-3.5 shrink-0 p-0.5 rounded hover:bg-accent"
            aria-label={expanded ? 'Collapse children' : 'Expand children'}
          >
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </button>
        )}
        {node.children.length === 0 && node.depth > 0 && (
          <span className="mt-3.5 shrink-0 w-5 flex justify-center" aria-hidden>
            <span className="h-px w-3 bg-border" />
          </span>
        )}
        <div className="flex-1 min-w-0">{renderCard(node.session)}</div>
      </div>
      {expanded && node.children.length > 0 && (
        <div className="space-y-1">
          {node.children.map((child) => (
            <SessionTreeItem key={child.session.key} node={child} renderCard={renderCard} />
          ))}
        </div>
      )}
    </div>
  )
}
