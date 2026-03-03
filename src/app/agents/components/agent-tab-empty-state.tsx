import type { LucideIcon } from 'lucide-react'

interface AgentTabEmptyStateProps {
  readonly icon: LucideIcon
  readonly title: React.ReactNode
  /** Optional secondary line below the title */
  readonly description?: React.ReactNode
  /** Optional CTA — pass a fully-formed <Button> */
  readonly action?: React.ReactNode
}

export function AgentTabEmptyState({ icon: Icon, title, description, action }: AgentTabEmptyStateProps) {
  return (
    <div className="rounded-2xl border border-dashed border-border/50 bg-card/30 p-12 text-center">
      <Icon className="mx-auto mb-3 h-8 w-8 text-muted-foreground/15" />
      <p className="text-sm text-muted-foreground/50">{title}</p>
      {description && <p className="mt-1 text-[10px] text-muted-foreground/30">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
