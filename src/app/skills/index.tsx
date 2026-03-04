import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  LayoutGrid,
  List,
  Package,
  RefreshCw,
  Search,
  XCircle,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { SkillStatusEntry } from '@/lib/gateway/types'
import { cn } from '@/lib/utils'
import { SkillCard } from './components/skill-card'
import { SkillDetailPanel } from './components/skill-detail-panel'
import { SkillsStatsBar } from './components/skills-stats-bar'
import type { SkillFilter } from './hooks/use-skills'
import { useSkills } from './hooks/use-skills'

// ---------------------------------------------------------------------------
//  Grouping helpers
// ---------------------------------------------------------------------------

type SourceGroup = 'workspace' | 'built-in' | 'installed' | 'other'

const SOURCE_ORDER: SourceGroup[] = ['workspace', 'built-in', 'installed', 'other']
const SOURCE_LABELS: Record<SourceGroup, string> = {
  workspace: 'Workspace',
  'built-in': 'Built-in',
  installed: 'Installed',
  other: 'Other',
}
const SOURCE_ICONS: Record<SourceGroup, string> = {
  workspace: '📁',
  'built-in': '📦',
  installed: '🔌',
  other: '🔗',
}

function toSourceGroup(skill: SkillStatusEntry): SourceGroup {
  if (skill.bundled) return 'built-in'
  if (skill.source === 'workspace') return 'workspace'
  if (skill.source === 'shared' || skill.source === 'managed') return 'installed'
  return 'other'
}

function groupBySource(skills: SkillStatusEntry[]): Partial<Record<SourceGroup, SkillStatusEntry[]>> {
  const out: Partial<Record<SourceGroup, SkillStatusEntry[]>> = {}
  for (const s of skills) {
    const key = toSourceGroup(s)
    out[key] ??= []
    out[key].push(s)
  }
  return out
}

// ---------------------------------------------------------------------------
//  Skill list row (list view)
// ---------------------------------------------------------------------------

type RowProps = {
  readonly skill: SkillStatusEntry
  readonly enabled: boolean
  readonly onToggle: () => void
  readonly onExpand: () => void
}

function SkillRow({ skill, enabled, onToggle, onExpand }: RowProps) {
  const hasMissing = skill.missing.bins.length > 0 || skill.missing.env.length > 0 || skill.missing.config.length > 0
  return (
    <div className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-accent/30 transition-colors">
      <button type="button" onClick={onToggle} className="flex items-center gap-3 flex-1 text-left cursor-pointer">
        <span className="text-lg shrink-0">{skill.emoji || '🔧'}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-foreground truncate">{skill.name}</span>
            {!enabled && (
              <Badge variant="outline" className="text-[8px]">
                disabled
              </Badge>
            )}
            {skill.blockedByAllowlist && (
              <Badge variant="outline" className="text-[8px] border-red-500/30 text-red-500">
                blocked
              </Badge>
            )}
            {hasMissing && (
              <Badge variant="outline" className="text-[8px] border-amber-500/30 text-amber-500 gap-0.5">
                <AlertCircle className="h-2 w-2" />
                needs setup
              </Badge>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground/50 truncate">{skill.description}</p>
        </div>
      </button>
      <div className="flex items-center gap-2 shrink-0">
        {enabled && !hasMissing ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        ) : (
          <XCircle className="h-4 w-4 text-muted-foreground/25" />
        )}
        <button
          type="button"
          onClick={onExpand}
          className="rounded p-0.5 text-muted-foreground/30 hover:text-foreground/70 transition-colors"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
//  Filter helpers
// ---------------------------------------------------------------------------

function matchesFilter(skill: SkillStatusEntry, filter: SkillFilter, enabled: boolean): boolean {
  if (filter === 'all') return true
  const hasMissing = skill.missing.bins.length > 0 || skill.missing.env.length > 0 || skill.missing.config.length > 0
  if (filter === 'ready') return enabled && !hasMissing && !skill.blockedByAllowlist
  if (filter === 'needs-setup') return hasMissing
  if (filter === 'blocked') return skill.blockedByAllowlist
  return true
}

const FILTER_OPTIONS: { value: SkillFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'ready', label: 'Ready' },
  { value: 'needs-setup', label: 'Needs Setup' },
  { value: 'blocked', label: 'Blocked' },
]

// ---------------------------------------------------------------------------
//  Page
// ---------------------------------------------------------------------------

export default function SkillsPage() {
  const {
    report,
    loading,
    busyKey,
    agentId,
    agentList,
    setAgentId,
    refresh,
    handleToggle,
    handleSetApiKey,
    handleInstall,
  } = useSkills()

  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<SkillFilter>('all')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [collapsed, setCollapsed] = useState<Set<SourceGroup>>(new Set())
  const [detailSkill, setDetailSkill] = useState<SkillStatusEntry | null>(null)

  const allSkills = report?.skills ?? []

  const enabledSet = useMemo(() => {
    const s = new Set<string>()
    for (const skill of allSkills) {
      if (!skill.disabled) s.add(skill.name)
    }
    return s
  }, [allSkills])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return allSkills.filter((s) => {
      const textMatch =
        !q ||
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.skillKey.toLowerCase().includes(q)
      return textMatch && matchesFilter(s, filter, enabledSet.has(s.name))
    })
  }, [allSkills, search, filter, enabledSet])

  const groups = groupBySource(filtered)

  const toggleSection = (src: SourceGroup) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      next.has(src) ? next.delete(src) : next.add(src)
      return next
    })
  }

  let content: React.ReactNode
  if (loading) {
    content = (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 9 }, (_unused, n) => `skills-skeleton-${n + 1}`).map((id) => (
          <div key={id} className="h-32 animate-pulse rounded-xl bg-muted/30" />
        ))}
      </div>
    )
  } else if (filtered.length === 0) {
    content = (
      <div className="flex flex-col items-center justify-center rounded-xl border border-border/40 py-16 gap-3 text-center">
        <Package className="h-8 w-8 text-muted-foreground/20" />
        <p className="text-sm font-medium text-muted-foreground">
          {search ? `No skills matching "${search}"` : 'No skills found'}
        </p>
      </div>
    )
  } else {
    content = (
      <div className="space-y-6">
        {SOURCE_ORDER.filter((src) => (groups[src]?.length ?? 0) > 0).map((src) => {
          const items = groups[src]!
          const isCollapsed = collapsed.has(src)
          return (
            <div key={src}>
              <button
                type="button"
                onClick={() => toggleSection(src)}
                className="flex items-center gap-2 mb-3 hover:opacity-80 transition-opacity"
              >
                {isCollapsed ? (
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <span className="text-sm">{SOURCE_ICONS[src]}</span>
                <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  {SOURCE_LABELS[src]}
                </p>
                <Badge variant="secondary" className="text-[9px]">
                  {items.length}
                </Badge>
              </button>

              {!isCollapsed &&
                (viewMode === 'grid' ? (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {items.map((skill) => (
                      <SkillCard
                        key={skill.skillKey}
                        skill={skill}
                        enabled={enabledSet.has(skill.name)}
                        busy={
                          busyKey === skill.skillKey ||
                          skill.install.some((o) => busyKey === `install:${skill.name}:${o.id}`)
                        }
                        onToggle={() => void handleToggle(skill.skillKey, !enabledSet.has(skill.name))}
                        onInstall={(installId) => void handleInstall(skill.name, installId)}
                        onSetApiKey={(apiKey) => void handleSetApiKey(skill.skillKey, apiKey)}
                        onExpand={() => setDetailSkill(skill)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-border/40 overflow-hidden divide-y divide-border/30">
                    {items.map((skill) => (
                      <SkillRow
                        key={skill.skillKey}
                        skill={skill}
                        enabled={enabledSet.has(skill.name)}
                        onToggle={() => void handleToggle(skill.skillKey, !enabledSet.has(skill.name))}
                        onExpand={() => setDetailSkill(skill)}
                      />
                    ))}
                  </div>
                ))}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <PageHeader
        icon={Package}
        title="Skills"
        description="Manage and configure skills available to your agents"
        badge={allSkills.length > 0 ? String(allSkills.length) : undefined}
      >
        {/* Agent selector */}
        {agentList.length > 1 && (
          <Select value={agentId || '__default__'} onValueChange={(v) => setAgentId(v === '__default__' ? '' : v)}>
            <SelectTrigger className="h-8 w-40 text-xs">
              <SelectValue placeholder="Default agent" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__default__">Default agent</SelectItem>
              {agentList.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name || a.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button size="sm" variant="outline" onClick={() => void refresh()} disabled={loading} className="gap-1.5">
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          Refresh
        </Button>
      </PageHeader>

      {/* Stats */}
      {!loading && allSkills.length > 0 && <SkillsStatsBar skills={allSkills} enabledSet={enabledSet} />}

      {/* Toolbar */}
      <div className="flex gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
          <Input
            placeholder="Search skills…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-10 bg-card/80 text-sm"
          />
          {search && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground/40">
              {filtered.length}
            </span>
          )}
        </div>

        {/* Filter */}
        <Select value={filter} onValueChange={(v) => setFilter(v as SkillFilter)}>
          <SelectTrigger className="h-10 w-36 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FILTER_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* View toggle */}
        <div className="flex gap-1 rounded-lg border border-border/50 bg-card/80 p-0.5">
          <Button
            size="sm"
            variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
            onClick={() => setViewMode('grid')}
            className="h-9 w-9 p-0"
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant={viewMode === 'list' ? 'secondary' : 'ghost'}
            onClick={() => setViewMode('list')}
            className="h-9 w-9 p-0"
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      {content}

      {/* Detail panel */}
      {detailSkill && (
        <SkillDetailPanel
          skill={detailSkill}
          enabled={enabledSet.has(detailSkill.name)}
          busy={!!busyKey}
          onClose={() => setDetailSkill(null)}
          onToggle={() => void handleToggle(detailSkill.skillKey, !enabledSet.has(detailSkill.name))}
          onInstall={(installId) => void handleInstall(detailSkill.name, installId)}
          onSetApiKey={(apiKey) => void handleSetApiKey(detailSkill.skillKey, apiKey)}
        />
      )}
    </div>
  )
}
