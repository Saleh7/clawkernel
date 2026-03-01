import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AgentStatPillProps {
  icon: LucideIcon
  value: React.ReactNode
  label: string
  iconClassName?: string
  valueClassName?: string
}

export function AgentStatPill({ icon: Icon, value, label, iconClassName, valueClassName }: AgentStatPillProps) {
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-border/50 bg-card/60 px-3 py-1.5 text-xs">
      <Icon className={cn('h-3.5 w-3.5 text-muted-foreground', iconClassName)} aria-hidden />
      <span className={cn('font-mono font-semibold text-foreground', valueClassName)}>{value}</span>
      <span className="text-muted-foreground">{label}</span>
    </div>
  )
}
