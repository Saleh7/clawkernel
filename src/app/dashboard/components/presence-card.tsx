import { Radio } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { PresenceEntry } from '@/lib/gateway/types'

type Props = {
  readonly entries: PresenceEntry[]
}

export function PresenceCard({ entries }: Props) {
  if (entries.length === 0) return null

  return (
    <Card className="border-border/50 bg-card/50 shadow-sm backdrop-blur-sm dark:shadow-none">
      <CardHeader className="px-3 pb-2 pt-3 sm:px-6 sm:pb-3 sm:pt-6">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Radio className="h-4 w-4 text-primary" /> Presence
          <span className="ml-auto font-mono text-xs text-muted-foreground">{entries.length} connected</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-1 pb-2 sm:px-3 sm:pb-4">
        <div className="grid gap-0.5 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map((p, i) => (
            <div
              key={p.instanceId ?? i}
              className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-accent/50 sm:px-3"
            >
              <div className="h-2 w-2 rounded-full bg-success" />
              <div className="min-w-0 flex-1 text-xs">
                <span className="font-semibold">{p.host ?? 'unknown'}</span>
                <span className="text-muted-foreground">
                  {' · '}
                  {p.platform ?? '—'} · {p.mode ?? '—'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
