import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  LayoutGrid,
  List,
  Package,
  RefreshCw,
  Save,
  Search,
  ToggleLeft,
  ToggleRight,
  XCircle,
  Zap,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'

import type { GatewayClient } from '@/lib/gateway/client'
import type { ConfigSnapshot, SkillStatusEntry, SkillStatusReport } from '@/lib/gateway/types'
import { createLogger } from '@/lib/logger'
import { cn } from '@/lib/utils'
import { useGatewayStore } from '@/stores/gateway-store'

const log = createLogger('agents:skills')

type Props = {
  readonly agentId: string
  readonly client: GatewayClient | null
  readonly storeSkills: SkillStatusReport | null
  readonly config: ConfigSnapshot | null
}

import { useAgentConfigSave } from '../hooks/use-agent-config-save'
import type { ParsedConfig } from '../types'
import { AgentTabEmptyState } from './agent-tab-empty-state'

function resolveSkillSource(skill: SkillStatusEntry): 'workspace' | 'built-in' | 'installed' {
  if (skill.bundled) return 'built-in'
  if (skill.source === 'workspace') return 'workspace'
  return 'installed'
}

function groupBySource(skills: SkillStatusEntry[]): Record<string, SkillStatusEntry[]> {
  const groups: Record<string, SkillStatusEntry[]> = {}
  for (const skill of skills) {
    const source = resolveSkillSource(skill)
    if (!groups[source]) {
      groups[source] = []
    }
    groups[source].push(skill)
  }
  return groups
}

const sourceOrder = ['workspace', 'built-in', 'installed']
const sourceLabels: Record<string, string> = { workspace: 'Workspace', 'built-in': 'Built-in', installed: 'Installed' }
const sourceIcons: Record<string, string> = { workspace: '📁', 'built-in': '📦', installed: '🔌' }

export function AgentSkills({ agentId, client, storeSkills, config }: Props) {
  const [report, setReport] = useState<SkillStatusReport | null>(storeSkills)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())
  const [reloading, setReloading] = useState(false)

  // Draft: null = all enabled (no filter), string[] = allowlist
  const cfg = config?.config as ParsedConfig | null | undefined
  const savedFilter = cfg?.agents?.list?.find((a) => a.id === agentId)?.skills
  const [filterDraft, setFilterDraft] = useState<string[] | null>(savedFilter ?? null)

  useEffect(() => {
    const fresh = (config?.config as ParsedConfig | null | undefined)?.agents?.list?.find(
      (a) => a.id === agentId,
    )?.skills
    setFilterDraft(fresh ?? null)
  }, [config, agentId])

  const refresh = useCallback(async () => {
    if (!client) return
    setLoading(true)
    try {
      const r = await client.request<SkillStatusReport>('skills.status', { agentId })
      setReport(r)
    } catch (err) {
      log.warn('Skills load failed', err)
    }
    setLoading(false)
  }, [client, agentId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const allSkills = report?.skills ?? []

  const filtered = useMemo(() => {
    if (!search.trim()) return allSkills
    const q = search.toLowerCase()
    return allSkills.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.skillKey.toLowerCase().includes(q),
    )
  }, [allSkills, search])

  const groups = groupBySource(filtered)

  const isEnabled = useCallback(
    (skillName: string) => {
      if (filterDraft === null) return true // all enabled
      return filterDraft.includes(skillName)
    },
    [filterDraft],
  )

  const enabledCount = useMemo(() => allSkills.filter((s) => isEnabled(s.name)).length, [allSkills, isEnabled])

  const isDirty = useMemo(() => {
    if (filterDraft === null && savedFilter === undefined) return false
    if (filterDraft === null && savedFilter !== undefined) return true
    if (filterDraft !== null && savedFilter === undefined) return true
    if (!filterDraft || !savedFilter) return true
    if (filterDraft.length !== savedFilter.length) return true
    return filterDraft.some((s, i) => s !== savedFilter[i])
  }, [filterDraft, savedFilter])

  const toggleSkill = (skillName: string) => {
    if (filterDraft === null) {
      // Currently "all enabled" — switch to explicit allowlist with this one removed
      const allNames = allSkills.map((s) => s.name).filter((n) => n !== skillName)
      setFilterDraft(allNames)
    } else if (filterDraft.includes(skillName)) {
      setFilterDraft(filterDraft.filter((n) => n !== skillName))
    } else {
      setFilterDraft([...filterDraft, skillName])
    }
  }

  const enableAll = () => setFilterDraft(null)

  const disableAll = () => setFilterDraft([])

  const reloadConfig = async () => {
    if (!client) return
    setReloading(true)
    try {
      const [r, sr] = await Promise.all([
        client.request<ConfigSnapshot>('config.get', {}),
        client.request<SkillStatusReport>('skills.status', { agentId }),
      ])
      useGatewayStore.getState().setConfig(r)
      setReport(sr)
      const freshFilter = (r.config as ParsedConfig | null | undefined)?.agents?.list?.find(
        (a) => a.id === agentId,
      )?.skills
      setFilterDraft(freshFilter ?? null)
    } catch (err) {
      log.warn('Config reload failed', err)
    }
    setReloading(false)
  }

  const patchSkills = useCallback(
    (entry: Record<string, unknown>) => {
      if (filterDraft === null) {
        const { skills: _, ...rest } = entry as Record<string, unknown> & { skills?: unknown }
        return rest
      }
      return { ...entry, skills: filterDraft }
    },
    [filterDraft],
  )

  const {
    saving,
    save: saveConfig,
    saveAndApply: saveAndApplyConfig,
  } = useAgentConfigSave({
    client,
    config,
    agentId,
    isDirty,
    patcher: patchSkills,
    messages: {
      saveError: 'Failed to save skill policy',
      applySuccess: 'Skills saved & applied — agents restarting',
      applyError: 'Failed to save & apply skill policy',
    },
  })

  const handleInstall = useCallback(
    async (skillName: string, installId: string) => {
      if (!client) return
      try {
        toast.info('Installing skill dependency…')
        const result = await client.request<{ ok: boolean; message: string }>('skills.install', {
          name: skillName,
          installId,
          timeoutMs: 120_000,
        })
        if (result.ok) {
          toast.success('Skill dependency installed')
          await refresh()
        } else {
          toast.error(result.message || 'Install failed')
        }
      } catch (err) {
        log.error('skills.install failed', err)
        toast.error('Failed to install skill dependency')
      }
    },
    [client, refresh],
  )

  const handleSkillUpdate = useCallback(
    async (patch: { skillKey: string; enabled?: boolean; apiKey?: string }) => {
      if (!client) return
      try {
        await client.request('skills.update', patch)
        toast.success('Skill updated')
        await refresh()
      } catch (err) {
        log.error('skills.update failed', err)
        toast.error('Failed to update skill')
      }
    },
    [client, refresh],
  )

  const toggleSection = (src: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev)
      next.has(src) ? next.delete(src) : next.add(src)
      return next
    })
  }

  let content: React.ReactNode
  if (loading) {
    content = (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_unused, n) => `agent-skill-skeleton-${n + 1}`).map((id) => (
          <Skeleton key={id} className="h-28 rounded-xl" />
        ))}
      </div>
    )
  } else if (filtered.length === 0) {
    content = (
      <AgentTabEmptyState
        icon={search ? Search : Package}
        title={search ? `No skills matching "${search}"` : 'No skills found'}
      />
    )
  } else {
    content = (
      <div className="space-y-6">
        {sourceOrder
          .filter((s) => groups[s]?.length)
          .map((src) => {
            const groupedSkills = groups[src]
            if (!groupedSkills) return null

            const collapsed = collapsedSections.has(src)
            return (
              <div key={src}>
                <button
                  type="button"
                  onClick={() => toggleSection(src)}
                  className="flex items-center gap-2 mb-3 hover:opacity-80 transition-opacity"
                >
                  {collapsed ? (
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <span className="text-sm">{sourceIcons[src]}</span>
                  <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    {sourceLabels[src]}
                  </p>
                  <Badge variant="secondary" className="text-[9px]">
                    {groupedSkills.length}
                  </Badge>
                </button>

                {!collapsed &&
                  (viewMode === 'grid' ? (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {groupedSkills.map((skill) => (
                        <SkillCard
                          key={skill.skillKey}
                          skill={skill}
                          enabled={isEnabled(skill.name)}
                          onToggle={() => toggleSkill(skill.name)}
                          onInstall={(installId) => void handleInstall(skill.name, installId)}
                          onUpdate={(patch) => void handleSkillUpdate(patch)}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {groupedSkills.map((skill) => (
                        <SkillRow
                          key={skill.skillKey}
                          skill={skill}
                          enabled={isEnabled(skill.name)}
                          onToggle={() => toggleSkill(skill.name)}
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
    <div className="space-y-4">
      {/* ── Header: Stats + Actions ── */}
      <div className="rounded-2xl border border-border/50 bg-card/80 backdrop-blur-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">Skill Policy</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {enabledCount}/{allSkills.length} skills enabled
              {filterDraft === null && <span className="ml-1 font-mono">(all)</span>}
              {isDirty && <span className="ml-2 text-yellow-500">· unsaved changes</span>}
            </p>
          </div>
          <Badge variant="outline" className="font-mono text-[10px]">
            {filterDraft === null ? 'no filter' : `${filterDraft.length} allowed`}
          </Badge>
        </div>

        <Separator className="opacity-40" />

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={enableAll} className="gap-1.5 rounded-lg">
            <ToggleRight className="h-3.5 w-3.5" /> Enable All
          </Button>
          <Button size="sm" variant="outline" onClick={disableAll} className="gap-1.5 rounded-lg">
            <ToggleLeft className="h-3.5 w-3.5" /> Disable All
          </Button>
          <div className="flex-1" />
          <Button
            size="sm"
            variant="outline"
            onClick={() => void reloadConfig()}
            disabled={reloading}
            className="gap-1.5 rounded-lg"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', reloading && 'animate-spin')} /> Reload
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void saveConfig()}
            disabled={saving || !isDirty}
            className="gap-1.5 rounded-lg"
          >
            <Save className="h-3.5 w-3.5" /> Save
          </Button>
          <Button
            size="sm"
            onClick={() => void saveAndApplyConfig()}
            disabled={saving || !isDirty}
            className="gap-1.5 rounded-lg"
          >
            <Zap className="h-3.5 w-3.5" /> {saving ? 'Applying…' : 'Save & Apply'}
          </Button>
        </div>
      </div>

      {/* ── Search + View Toggle ── */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
          <Input
            placeholder="Search skills…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-10 bg-card/80 backdrop-blur-sm border-border/50 text-sm"
          />
          {search && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground/40">
              {filtered.length} result{filtered.length === 1 ? '' : 's'}
            </span>
          )}
        </div>
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

      {/* ── Content ── */}
      {content}
    </div>
  )
}

function SkillCard({
  skill,
  enabled,
  onToggle,
  onInstall,
  onUpdate,
}: {
  readonly skill: SkillStatusEntry
  readonly enabled: boolean
  readonly onToggle: () => void
  readonly onInstall: (installId: string) => void
  readonly onUpdate: (patch: { skillKey: string; enabled?: boolean; apiKey?: string }) => void
}) {
  const hasMissing = skill.missing.bins.length > 0 || skill.missing.env.length > 0 || skill.missing.config.length > 0
  const hasInstallOptions = skill.install.length > 0 && hasMissing

  return (
    <div
      className={cn(
        'rounded-xl border p-4 transition-all duration-200 text-left',
        enabled ? 'border-primary/20 bg-card/80 backdrop-blur-sm' : 'border-border/30 bg-muted/20 opacity-50',
      )}
    >
      <button type="button" onClick={onToggle} className="w-full text-left cursor-pointer">
        <div className="flex items-start justify-between mb-2">
          <span className="text-2xl">{skill.emoji || '🔧'}</span>
          {enabled ? (
            <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
          ) : (
            <XCircle className="h-4 w-4 text-muted-foreground/25 shrink-0" />
          )}
        </div>
        <p className="text-xs font-semibold text-foreground truncate">{skill.name}</p>
        <p className="text-[10px] text-muted-foreground/60 line-clamp-2 mt-0.5 min-h-[28px]">{skill.description}</p>
      </button>
      <div className="flex flex-wrap gap-1 mt-2">
        {!enabled && (
          <Badge variant="outline" className="text-[8px]">
            disabled
          </Badge>
        )}
        {skill.blockedByAllowlist && (
          <Badge variant="outline" className="text-[8px] border-yellow-500/30 text-yellow-600 dark:text-yellow-400">
            blocked
          </Badge>
        )}
        {skill.always && (
          <Badge variant="secondary" className="text-[8px]">
            always
          </Badge>
        )}
        {hasMissing && (
          <Badge
            variant="outline"
            className="text-[8px] border-orange-500/30 text-orange-600 dark:text-orange-400 gap-0.5"
          >
            <AlertCircle className="h-2 w-2" />
            {skill.missing.bins.length + skill.missing.env.length + skill.missing.config.length} missing
          </Badge>
        )}
      </div>
      {/* Install options for missing dependencies */}
      {hasInstallOptions && (
        <div className="mt-2 pt-2 border-t border-border/20 space-y-1">
          {skill.install.map((opt) => (
            <button
              type="button"
              key={opt.id}
              onClick={(e) => {
                e.stopPropagation()
                onInstall(opt.id)
              }}
              className="flex items-center gap-1.5 w-full text-[9px] text-primary hover:text-primary/80 transition-colors cursor-pointer"
            >
              <Package className="h-2.5 w-2.5" />
              Install: {opt.label}
            </button>
          ))}
        </div>
      )}
      {/* Missing env keys → API key prompt */}
      {skill.missing.env.length > 0 && (
        <div className="mt-2 pt-2 border-t border-border/20">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const form = e.target as HTMLFormElement
              const input = form.elements.namedItem('apiKey') as HTMLInputElement
              const val = input.value.trim()
              if (val) {
                onUpdate({ skillKey: skill.skillKey, apiKey: val })
                input.value = ''
              }
            }}
            className="flex items-center gap-1.5"
          >
            <input
              name="apiKey"
              type="password"
              placeholder={`API key (${skill.missing.env[0]})`}
              className="flex-1 rounded border border-border/40 bg-background/50 px-2 py-0.5 text-[9px] placeholder:text-muted-foreground/40"
            />
            <button type="submit" className="text-[9px] text-primary hover:text-primary/80 font-medium cursor-pointer">
              Set
            </button>
          </form>
        </div>
      )}
      {/* Missing config keys → show hint */}
      {skill.missing.config.length > 0 && (
        <div className="mt-1">
          <p className="text-[8px] text-orange-500/70">Missing config: {skill.missing.config.join(', ')}</p>
        </div>
      )}
    </div>
  )
}

function SkillRow({
  skill,
  enabled,
  onToggle,
}: {
  readonly skill: SkillStatusEntry
  readonly enabled: boolean
  readonly onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 transition-colors text-left cursor-pointer',
        'hover:bg-accent/50',
        !enabled && 'opacity-50',
      )}
    >
      <span className="text-lg shrink-0">{skill.emoji || '🔧'}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-foreground">{skill.name}</span>
          {!enabled && (
            <Badge variant="outline" className="text-[8px]">
              disabled
            </Badge>
          )}
          {skill.blockedByAllowlist && (
            <Badge variant="outline" className="text-[8px] border-yellow-500/30 text-yellow-600 dark:text-yellow-400">
              blocked
            </Badge>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground/50 truncate">{skill.description}</p>
      </div>
      {enabled ? (
        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
      ) : (
        <XCircle className="h-4 w-4 text-muted-foreground/25 shrink-0" />
      )}
    </button>
  )
}
