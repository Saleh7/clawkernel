import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type Status = 'success' | 'warning' | 'error'

const STATUS_COLOR: Record<Status, string> = {
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-destructive',
}

type MetricTileProps = {
  readonly icon: React.ComponentType<{ className?: string }>
  readonly label: string
  readonly value: string
  readonly sub?: string
  readonly status?: Status
}

export function MetricTile({ icon: Icon, label, value, sub, status }: MetricTileProps) {
  const color = status ? STATUS_COLOR[status] : 'text-foreground'

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardContent className="flex items-center gap-3 p-3 sm:p-4">
        <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg bg-accent sm:h-10 sm:w-10', color)}>
          <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className={cn('truncate font-mono text-base font-bold sm:text-lg', color)}>{value}</div>
          {sub && <div className="truncate text-[9px] text-muted-foreground">{sub}</div>}
        </div>
      </CardContent>
    </Card>
  )
}
