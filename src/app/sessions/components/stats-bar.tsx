import { ArrowUpDown, Bot, MessageSquare, Monitor, Users, Zap } from 'lucide-react'
import { memo, useMemo } from 'react'
import type { GatewaySessionRow } from '@/lib/gateway/types'
import { extractAgentId, formatTokens, isActive } from '../utils'

export const StatsBar = memo(function StatsBar({ sessions }: { sessions: GatewaySessionRow[] }) {
  const stats = useMemo(() => {
    const active = sessions.filter(isActive).length
    const totalTokens = sessions.reduce((a, s) => a + (s.totalTokens ?? 0), 0)
    const direct = sessions.filter((s) => s.kind === 'direct').length
    const group = sessions.filter((s) => s.kind === 'group').length
    const agents = new Set(sessions.map((s) => extractAgentId(s.key)))
    return { total: sessions.length, active, totalTokens, direct, group, agentCount: agents.size }
  }, [sessions])

  const pills: { label: string; value: string; icon: React.ReactNode; color: string }[] = [
    {
      label: 'Sessions',
      value: String(stats.total),
      icon: <MessageSquare className="h-3.5 w-3.5" />,
      color: 'text-primary',
    },
    { label: 'Active', value: String(stats.active), icon: <Zap className="h-3.5 w-3.5" />, color: 'text-emerald-500' },
    {
      label: 'Tokens',
      value: formatTokens(stats.totalTokens),
      icon: <ArrowUpDown className="h-3.5 w-3.5" />,
      color: 'text-sky-500',
    },
    {
      label: 'Direct',
      value: String(stats.direct),
      icon: <Monitor className="h-3.5 w-3.5" />,
      color: 'text-violet-500',
    },
    { label: 'Group', value: String(stats.group), icon: <Users className="h-3.5 w-3.5" />, color: 'text-amber-500' },
    { label: 'Agents', value: String(stats.agentCount), icon: <Bot className="h-3.5 w-3.5" />, color: 'text-pink-500' },
  ]

  return (
    <div className="flex flex-wrap gap-2">
      {pills.map((p) => (
        <div
          key={p.label}
          className="flex items-center gap-2 rounded-xl border border-border/50 bg-card/80 backdrop-blur-sm px-3 py-1.5"
        >
          <span className={p.color}>{p.icon}</span>
          <span className="text-xs font-medium text-muted-foreground">{p.label}</span>
          <span className="text-sm font-bold">{p.value}</span>
        </div>
      ))}
    </div>
  )
})
