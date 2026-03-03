import type { LucideIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface PageHeaderProps {
  readonly icon: LucideIcon
  readonly title: string
  readonly description: string
  readonly badge?: string
  readonly children?: React.ReactNode
}

export function PageHeader({ icon: Icon, title, description, badge, children }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 sm:h-8 sm:w-8">
            <Icon className="h-3.5 w-3.5 text-primary sm:h-4 sm:w-4" />
          </div>
          <h1 className="text-lg font-bold tracking-tight sm:text-xl">{title}</h1>
          {badge && (
            <Badge variant="secondary" className="font-mono text-[10px] sm:text-xs">
              {badge}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground sm:text-sm">{description}</p>
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  )
}
