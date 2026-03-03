import { AlertCircle, CheckCircle2, Package, ShieldX, XCircle } from 'lucide-react'
import type { SkillStatusEntry } from '@/lib/gateway/types'
import { cn } from '@/lib/utils'

type Props = {
  readonly skills: SkillStatusEntry[]
  readonly enabledSet: Set<string>
}

type Tile = {
  label: string
  value: number
  icon: React.ElementType
  color: string
}

export function SkillsStatsBar({ skills, enabledSet }: Props) {
  const total = skills.length
  const ready = skills.filter(
    (s) =>
      enabledSet.has(s.name) &&
      s.missing.bins.length === 0 &&
      s.missing.env.length === 0 &&
      s.missing.config.length === 0,
  ).length
  const needsSetup = skills.filter(
    (s) =>
      enabledSet.has(s.name) && (s.missing.bins.length > 0 || s.missing.env.length > 0 || s.missing.config.length > 0),
  ).length
  const blocked = skills.filter((s) => s.blockedByAllowlist).length
  const disabled = total - enabledSet.size

  const tiles: Tile[] = [
    { label: 'Total', value: total, icon: Package, color: 'text-muted-foreground' },
    { label: 'Ready', value: ready, icon: CheckCircle2, color: 'text-emerald-500' },
    { label: 'Needs Setup', value: needsSetup, icon: AlertCircle, color: 'text-amber-500' },
    { label: 'Blocked', value: blocked, icon: ShieldX, color: 'text-red-500' },
    { label: 'Disabled', value: disabled, icon: XCircle, color: 'text-muted-foreground/40' },
  ]

  return (
    <div className="grid grid-cols-5 gap-2">
      {tiles.map(({ label, value, icon: Icon, color }) => (
        <div
          key={label}
          className="flex flex-col items-center justify-center rounded-xl border border-border/40 bg-card/80 py-3 gap-1"
        >
          <Icon className={cn('h-4 w-4', color)} />
          <p className="text-base font-bold text-foreground">{value}</p>
          <p className="text-[9px] font-medium text-muted-foreground/60 uppercase tracking-wider">{label}</p>
        </div>
      ))}
    </div>
  )
}
