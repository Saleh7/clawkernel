import {
  ArrowDown,
  ArrowUp,
  CheckSquare,
  Flame,
  Layers,
  LayoutGrid,
  LayoutList,
  Moon,
  Pause,
  Play,
  Search,
  Trash2,
  Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import type { KindFilter, QuickFilter, SortDir, SortField, ViewMode } from '../types'

export function SessionsControls({
  quickFilter,
  setQuickFilter,
  quickCounts,
  autoRefresh,
  setAutoRefresh,
  gatewayLimit,
  setGatewayLimit,
  search,
  setSearch,
  sortField,
  sortDir,
  onToggleSort,
  kindFilter,
  setKindFilter,
  uniqueAgents,
  agentFilter,
  setAgentFilter,
  viewMode,
  setViewMode,
  bulkMode,
  selectedCount,
  visibleCount,
  onToggleBulkMode,
  onSelectVisible,
  onOpenBulkDelete,
}: {
  readonly quickFilter: QuickFilter
  readonly setQuickFilter: (next: QuickFilter) => void
  readonly quickCounts: { all: number; active: number; highUsage: number; stale: number }
  readonly autoRefresh: boolean
  readonly setAutoRefresh: (next: boolean) => void
  readonly gatewayLimit: number
  readonly setGatewayLimit: (next: number) => void
  readonly search: string
  readonly setSearch: (next: string) => void
  readonly sortField: SortField
  readonly sortDir: SortDir
  readonly onToggleSort: (field: SortField) => void
  readonly kindFilter: KindFilter
  readonly setKindFilter: (next: KindFilter) => void
  readonly uniqueAgents: string[]
  readonly agentFilter: string
  readonly setAgentFilter: (next: string) => void
  readonly viewMode: ViewMode
  readonly setViewMode: (next: ViewMode) => void
  readonly bulkMode: boolean
  readonly selectedCount: number
  readonly visibleCount: number
  readonly onToggleBulkMode: () => void
  readonly onSelectVisible: () => void
  readonly onOpenBulkDelete: () => void
}) {
  const SortIcon = sortDir === 'desc' ? ArrowDown : ArrowUp

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {[
          { id: 'none' as QuickFilter, label: 'All', icon: Layers, color: '', count: quickCounts.all },
          {
            id: 'active' as QuickFilter,
            label: 'Active Now',
            icon: Zap,
            color: 'text-emerald-500',
            count: quickCounts.active,
          },
          {
            id: 'highUsage' as QuickFilter,
            label: 'High Usage',
            icon: Flame,
            color: 'text-amber-500',
            count: quickCounts.highUsage,
          },
          {
            id: 'stale' as QuickFilter,
            label: 'Stale',
            icon: Moon,
            color: 'text-muted-foreground',
            count: quickCounts.stale,
          },
        ].map((qf) => {
          const isPressed = quickFilter === qf.id
          const Icon = qf.icon
          return (
            <button
              key={qf.id}
              type="button"
              aria-pressed={isPressed}
              aria-label={`Filter ${qf.label}`}
              onClick={() => setQuickFilter(quickFilter === qf.id ? 'none' : qf.id)}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all',
                isPressed
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'border-border/50 bg-card/60 text-muted-foreground hover:text-foreground hover:border-border',
              )}
            >
              <Icon className={cn('h-3.5 w-3.5', isPressed ? 'text-primary' : qf.color)} />
              {qf.label}
              <span className={cn('font-mono text-[10px]', isPressed ? 'text-primary' : 'text-muted-foreground/60')}>
                {qf.count}
              </span>
            </button>
          )
        })}

        <div className="flex-1" />

        <button
          type="button"
          aria-pressed={autoRefresh}
          aria-label={autoRefresh ? 'Disable auto refresh' : 'Enable auto refresh'}
          onClick={() => setAutoRefresh(!autoRefresh)}
          className={cn(
            'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all',
            autoRefresh
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
              : 'border-border/50 bg-card/60 text-muted-foreground hover:text-foreground',
          )}
        >
          {autoRefresh ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          {autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh'}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9 h-9"
            aria-label="Search sessions"
            placeholder="Search sessions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Separator orientation="vertical" className="h-6 hidden sm:block" />

        {(['updated', 'tokens', 'name'] as SortField[]).map((field) => (
          <Button
            key={field}
            size="sm"
            variant={sortField === field ? 'default' : 'outline'}
            className="text-xs"
            aria-pressed={sortField === field}
            onClick={() => onToggleSort(field)}
          >
            {field.charAt(0).toUpperCase() + field.slice(1)}
            {sortField === field && <SortIcon className="h-3 w-3 ml-1" />}
          </Button>
        ))}

        <Separator orientation="vertical" className="h-6 hidden sm:block" />

        {(['all', 'direct', 'group'] as KindFilter[]).map((kind) => (
          <Button
            key={kind}
            size="sm"
            variant={kindFilter === kind ? 'default' : 'outline'}
            className="text-xs"
            aria-pressed={kindFilter === kind}
            onClick={() => setKindFilter(kind)}
          >
            {kind.charAt(0).toUpperCase() + kind.slice(1)}
          </Button>
        ))}

        {uniqueAgents.length > 1 && (
          <select
            aria-label="Filter by agent"
            className="h-9 rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
          >
            <option value="all">All Agents</option>
            {uniqueAgents.map((agent) => (
              <option key={agent} value={agent}>
                {agent}
              </option>
            ))}
          </select>
        )}

        <select
          aria-label="Server sessions limit"
          className="h-9 rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
          value={String(gatewayLimit)}
          onChange={(e) => {
            const next = Number.parseInt(e.target.value, 10)
            setGatewayLimit(Number.isFinite(next) ? next : 0)
          }}
        >
          <option value="200">Server 200</option>
          <option value="500">Server 500</option>
          <option value="1000">Server 1000</option>
          <option value="0">Server All</option>
        </select>

        <Separator orientation="vertical" className="h-6 hidden sm:block" />

        <div className="inline-flex rounded-lg border border-border p-0.5">
          {(
            [
              { mode: 'flat' as ViewMode, label: 'Flat', icon: LayoutList },
              { mode: 'grouped' as ViewMode, label: 'Grouped', icon: LayoutGrid },
              { mode: 'tree' as ViewMode, label: 'Tree', icon: Layers },
            ] as const
          ).map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.mode}
                type="button"
                aria-pressed={viewMode === item.mode}
                aria-label={`Switch to ${item.label} view`}
                onClick={() => setViewMode(item.mode)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-colors',
                  viewMode === item.mode ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="h-3 w-3" />
                {item.label}
              </button>
            )
          })}
        </div>

        <Button
          size="sm"
          variant={bulkMode ? 'default' : 'outline'}
          aria-pressed={bulkMode}
          aria-label="Toggle bulk selection"
          onClick={onToggleBulkMode}
        >
          <CheckSquare className="h-3.5 w-3.5" />
        </Button>

        {bulkMode && visibleCount > 0 && (
          <Button size="sm" variant="outline" onClick={onSelectVisible} aria-label="Select visible sessions">
            Select visible ({visibleCount})
          </Button>
        )}

        {bulkMode && selectedCount > 0 && (
          <Button size="sm" variant="destructive" onClick={onOpenBulkDelete} aria-label="Delete selected sessions">
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            Delete {selectedCount}
          </Button>
        )}
      </div>
    </>
  )
}
