import { Bot, ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import type { GatewaySessionRow } from '@/lib/gateway/types'
import { formatTokens } from '../utils'

export function AgentGroup({
  agent,
  sessions,
  renderCard,
}: {
  agent: string
  sessions: GatewaySessionRow[]
  renderCard: (s: GatewaySessionRow) => React.ReactNode
}) {
  const [collapsed, setCollapsed] = useState(false)
  const totalTokens = sessions.reduce((a, s) => a + (s.totalTokens ?? 0), 0)

  return (
    <div className="rounded-2xl border border-border/50 bg-card/80 backdrop-blur-sm overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
        onClick={() => setCollapsed(!collapsed)}
        aria-expanded={!collapsed}
      >
        {collapsed ? (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
        <Bot className="h-4 w-4 text-pink-500" />
        <span className="font-semibold text-sm">{agent}</span>
        <Badge variant="secondary" className="text-[10px]">
          {sessions.length} sessions
        </Badge>
        <span className="text-xs text-muted-foreground ml-auto">{formatTokens(totalTokens)} tokens</span>
      </button>
      {!collapsed && <div className="border-t border-border/50 p-2 space-y-2">{sessions.map(renderCard)}</div>}
    </div>
  )
}
