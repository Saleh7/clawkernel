import { Clock, Hash, Layers, MessageSquare } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatTimestamp } from '@/hooks/use-time-format'
import type { GatewaySessionRow } from '@/lib/gateway/types'
import { cn } from '@/lib/utils'

const MAX_VISIBLE = 9

const KIND_STYLE: Record<string, string> = {
  direct: 'border-success/20 bg-success/10 text-success',
  group: 'border-chart-2/20 bg-chart-2/10 text-chart-2',
}

type Props = {
  readonly sessions: GatewaySessionRow[]
  readonly connected: boolean
  readonly is24h: boolean
}

export function SessionsCard({ sessions, connected, is24h }: Props) {
  return (
    <Card className="border-border/50 bg-card/50 shadow-sm backdrop-blur-sm dark:shadow-none">
      <CardHeader className="px-3 pb-2 pt-3 sm:px-6 sm:pb-3 sm:pt-6">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Layers className="h-4 w-4 text-primary" /> Sessions
          <span className="ml-auto font-mono text-xs text-muted-foreground">{sessions.length} total</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-1 pb-2 sm:px-3 sm:pb-4">
        {sessions.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            {connected ? 'No active sessions' : 'Connecting...'}
          </p>
        ) : (
          <div className="grid gap-0.5 sm:grid-cols-2 lg:grid-cols-3">
            {sessions.slice(0, MAX_VISIBLE).map((s) => (
              <SessionRow key={s.key} session={s} is24h={is24h} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function SessionRow({ session: s, is24h }: { readonly session: GatewaySessionRow; readonly is24h: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-accent/50 sm:px-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-xs font-semibold sm:text-sm">
            {s.displayName ?? s.label ?? s.key.split(':').pop()}
          </span>
          <Badge
            variant="outline"
            className={cn(
              'text-[8px] sm:text-[9px]',
              KIND_STYLE[s.kind] ?? 'border-border bg-muted text-muted-foreground',
            )}
          >
            {s.kind}
          </Badge>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          {s.surface && (
            <span className="flex items-center gap-0.5">
              <Hash className="h-2.5 w-2.5" />
              {s.surface}
            </span>
          )}
          {s.totalTokens != null && s.totalTokens > 0 && (
            <span className="flex items-center gap-0.5">
              <MessageSquare className="h-2.5 w-2.5" />
              {(s.totalTokens / 1000).toFixed(1)}k
            </span>
          )}
          {s.updatedAt && (
            <span className="flex items-center gap-0.5">
              <Clock className="h-2.5 w-2.5" />
              {formatTimestamp(s.updatedAt, is24h)}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
