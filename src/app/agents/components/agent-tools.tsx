import {
  AlertCircle,
  CheckCircle2,
  Info,
  Loader2,
  RefreshCw,
  Save,
  Terminal,
  ToggleLeft,
  ToggleRight,
  XCircle,
  Zap,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import type { GatewayClient } from '@/lib/gateway/client'
import type { ConfigSnapshot, ToolsCatalogResult } from '@/lib/gateway/types'
import { createLogger } from '@/lib/logger'
import { cn } from '@/lib/utils'
import { useGatewayStore } from '@/stores/gateway-store'
import { useAgentConfigSave } from '../hooks/use-agent-config-save'
import { FALLBACK_PROFILES, FALLBACK_SECTIONS, PRESET_ICONS, TOOL_ICONS } from '../tool-catalog'
import { normalizeToolName, resolveToolAllowed, resolveToolProfilePolicy } from '../tool-policy'
import type { ParsedConfig } from '../types'

const log = createLogger('agents:tools')

// ---------------------------------------------------------------------------
//  Component
// ---------------------------------------------------------------------------

type Props = {
  agentId: string
  config: ConfigSnapshot | null
  client: GatewayClient | null
}

export function AgentTools({ agentId, config, client }: Props) {
  // ── Catalog from server ──
  const [catalog, setCatalog] = useState<ToolsCatalogResult | null>(null)
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const fetchedAgentRef = useRef<string | null>(null)

  const fetchCatalog = useCallback(
    async (signal?: AbortSignal) => {
      if (!client?.connected) return
      setCatalogLoading(true)
      setCatalogError(null)
      try {
        const r = await client.request<ToolsCatalogResult>('tools.catalog', { agentId })
        if (signal?.aborted) return
        setCatalog(r)
        fetchedAgentRef.current = agentId
      } catch (err) {
        if (signal?.aborted) return
        const msg = err instanceof Error ? err.message : 'Failed to load tools catalog'
        log.warn('tools.catalog failed, using fallback', err)
        setCatalogError(msg)
      }
      setCatalogLoading(false)
    },
    [client, agentId],
  )

  useEffect(() => {
    const ac = new AbortController()
    fetchedAgentRef.current = null
    void fetchCatalog(ac.signal)
    return () => ac.abort()
  }, [fetchCatalog])

  // ── Resolved catalog (server or fallback) ──
  const usingFallback = !catalog
  const groups = catalog?.groups ?? FALLBACK_SECTIONS
  const profiles = catalog?.profiles ?? FALLBACK_PROFILES
  const allTools = useMemo(() => groups.flatMap((g) => g.tools), [groups])
  const allToolIds = useMemo(() => allTools.map((t) => t.id), [allTools])

  // ── Config-based state ──
  const cfg = config?.config as ParsedConfig | null | undefined
  const entry = cfg?.agents?.list?.find((a) => a.id === agentId)
  const agentTools = entry?.tools ?? {}
  const globalTools = cfg?.tools ?? {}

  // Detect explicit allowlist modes (important for UX warnings)
  const hasAgentAllow = Array.isArray(agentTools.allow) && agentTools.allow.length > 0
  const hasGlobalAllow = Array.isArray(globalTools.allow) && globalTools.allow.length > 0

  const savedProfile = agentTools.profile ?? globalTools.profile ?? 'full'
  const savedAlsoAllow = useMemo(() => agentTools.alsoAllow ?? [], [agentTools.alsoAllow])
  const savedDeny = useMemo(() => agentTools.deny ?? [], [agentTools.deny])

  // ── Draft state ──
  const [profileDraft, setProfileDraft] = useState(savedProfile)
  const [alsoAllowDraft, setAlsoAllowDraft] = useState<string[]>(savedAlsoAllow)
  const [denyDraft, setDenyDraft] = useState<string[]>(savedDeny)
  const [reloading, setReloading] = useState(false)

  // Sync drafts on external config change
  useEffect(() => {
    setProfileDraft(savedProfile)
    setAlsoAllowDraft(savedAlsoAllow)
    setDenyDraft(savedDeny)
  }, [savedProfile, savedAlsoAllow, savedDeny])

  // ── Policy resolution ──
  const basePolicy = useMemo(() => {
    if (hasAgentAllow) {
      return { allow: agentTools.allow ?? [], deny: agentTools.deny ?? [] }
    }
    return resolveToolProfilePolicy(profileDraft) ?? undefined
  }, [hasAgentAllow, agentTools.allow, agentTools.deny, profileDraft])

  const isAllowed = useCallback(
    (toolId: string) => resolveToolAllowed(toolId, basePolicy, alsoAllowDraft, denyDraft).allowed,
    [basePolicy, alsoAllowDraft, denyDraft],
  )

  const totalAllowed = useMemo(() => allTools.filter((t) => isAllowed(t.id)).length, [allTools, isAllowed])

  // Editable only when no explicit agent allowlist
  const editable = !hasAgentAllow

  const isDirty = useMemo(() => {
    if (profileDraft !== savedProfile) return true
    if (alsoAllowDraft.length !== savedAlsoAllow.length || alsoAllowDraft.some((v, i) => v !== savedAlsoAllow[i]))
      return true
    if (denyDraft.length !== savedDeny.length || denyDraft.some((v, i) => v !== savedDeny[i])) return true
    return false
  }, [profileDraft, savedProfile, alsoAllowDraft, savedAlsoAllow, denyDraft, savedDeny])

  // ── Actions ──

  const toggleTool = (toolId: string) => {
    if (!editable) return
    const normalized = normalizeToolName(toolId)
    const { allowed, baseAllowed } = resolveToolAllowed(toolId, basePolicy, alsoAllowDraft, denyDraft)

    const nextAlsoAllow = new Set(alsoAllowDraft.map(normalizeToolName).filter(Boolean))
    const nextDeny = new Set(denyDraft.map(normalizeToolName).filter(Boolean))

    if (allowed) {
      // Disable: remove from alsoAllow, add to deny
      nextAlsoAllow.delete(normalized)
      nextDeny.add(normalized)
    } else {
      // Enable: remove from deny, add to alsoAllow if not in base
      nextDeny.delete(normalized)
      if (!baseAllowed) {
        nextAlsoAllow.add(normalized)
      }
    }

    setAlsoAllowDraft([...nextAlsoAllow])
    setDenyDraft([...nextDeny])
  }

  const updateAll = (enable: boolean) => {
    if (!editable) return
    const nextAlsoAllow = new Set(alsoAllowDraft.map(normalizeToolName).filter(Boolean))
    const nextDeny = new Set(denyDraft.map(normalizeToolName).filter(Boolean))

    for (const toolId of allToolIds) {
      const normalized = normalizeToolName(toolId)
      const { baseAllowed } = resolveToolAllowed(toolId, basePolicy, [], [])

      if (enable) {
        nextDeny.delete(normalized)
        if (!baseAllowed) nextAlsoAllow.add(normalized)
      } else {
        nextAlsoAllow.delete(normalized)
        nextDeny.add(normalized)
      }
    }

    setAlsoAllowDraft([...nextAlsoAllow])
    setDenyDraft([...nextDeny])
  }

  const applyPreset = (presetId: string) => {
    if (!editable) return
    setProfileDraft(presetId)
    setAlsoAllowDraft([])
    setDenyDraft([])
  }

  const reloadConfig = async () => {
    if (!client) return
    setReloading(true)
    try {
      const [r] = await Promise.all([client.request<ConfigSnapshot>('config.get', {}), fetchCatalog()])
      useGatewayStore.getState().setConfig(r)
      const freshCfg = r.config as ParsedConfig | null | undefined
      const freshEntry = freshCfg?.agents?.list?.find((a) => a.id === agentId)
      const freshTools = freshEntry?.tools ?? freshCfg?.tools ?? {}
      setProfileDraft(freshTools.profile ?? 'full')
      setAlsoAllowDraft(freshTools.alsoAllow ?? [])
      setDenyDraft(freshTools.deny ?? [])
    } catch (err) {
      log.warn('Config reload failed', err)
    }
    setReloading(false)
  }

  const buildToolsPatch = useCallback(() => {
    const toolsPatch: Record<string, unknown> = { profile: profileDraft }
    if (denyDraft.length > 0) toolsPatch.deny = denyDraft
    if (alsoAllowDraft.length > 0) toolsPatch.alsoAllow = alsoAllowDraft
    return toolsPatch
  }, [profileDraft, denyDraft, alsoAllowDraft])

  const toolsPatcher = useCallback(
    (entry: Record<string, unknown>) => ({ ...entry, tools: buildToolsPatch() }),
    [buildToolsPatch],
  )

  const {
    saving,
    save: saveConfig,
    saveAndApply,
  } = useAgentConfigSave({
    client,
    config,
    agentId,
    isDirty,
    patcher: toolsPatcher,
    messages: {
      saveError: 'Failed to save tools configuration',
      applySuccess: 'Tools saved & applied — agents restarting',
      applyError: 'Failed to save & apply tools configuration',
    },
  })

  // ── Loading state ──
  if (catalogLoading && !catalog) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-36 rounded-2xl" />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="rounded-2xl border border-border/50 bg-card/80 backdrop-blur-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">Tool Policy</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {totalAllowed}/{allTools.length} tools enabled · profile:{' '}
              <span className="font-mono">{profileDraft}</span>
              {isDirty && <span className="ml-2 text-yellow-500">· unsaved changes</span>}
            </p>
          </div>
          <Badge className="text-sm font-mono px-3 py-1">{profileDraft}</Badge>
        </div>

        <Separator className="opacity-40" />

        {/* Warnings */}
        {catalogError && (
          <div className="flex items-start gap-2 rounded-lg border border-yellow-500/20 bg-yellow-500/5 px-3 py-2">
            <AlertCircle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
            <p className="text-xs text-yellow-600 dark:text-yellow-400">
              Could not load runtime tool catalog. Showing fallback list.
            </p>
          </div>
        )}
        {hasAgentAllow && (
          <div className="flex items-start gap-2 rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2">
            <Info className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
            <p className="text-xs text-blue-600 dark:text-blue-400">
              This agent uses an explicit <code className="font-mono">allow</code> list. Tool overrides are managed in
              config directly.
            </p>
          </div>
        )}
        {hasGlobalAllow && !hasAgentAllow && (
          <div className="flex items-start gap-2 rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2">
            <Info className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
            <p className="text-xs text-blue-600 dark:text-blue-400">
              Global <code className="font-mono">tools.allow</code> is set. Agent overrides cannot enable tools that are
              globally blocked.
            </p>
          </div>
        )}

        {/* Quick Presets */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/60 mb-2">
            Quick Presets
          </p>
          <div className="flex flex-wrap gap-2">
            {profiles.map((preset) => {
              const Icon = PRESET_ICONS[preset.id] ?? Zap
              const isActive = profileDraft === preset.id && alsoAllowDraft.length === 0 && denyDraft.length === 0
              return (
                <Button
                  key={preset.id}
                  size="sm"
                  variant={isActive ? 'default' : 'outline'}
                  onClick={() => applyPreset(preset.id)}
                  disabled={!editable}
                  className={cn('gap-1.5 rounded-lg', isActive && 'shadow-sm')}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {preset.label}
                </Button>
              )
            })}
          </div>
        </div>

        <Separator className="opacity-40" />

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => updateAll(true)}
            disabled={!editable}
            className="gap-1.5 rounded-lg"
          >
            <ToggleRight className="h-3.5 w-3.5" /> Enable All
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => updateAll(false)}
            disabled={!editable}
            className="gap-1.5 rounded-lg"
          >
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
            onClick={() => void saveAndApply()}
            disabled={saving || !isDirty}
            className="gap-1.5 rounded-lg"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
            {saving ? 'Applying…' : 'Save & Apply'}
          </Button>
        </div>
      </div>

      {/* ── Tool Grid ── */}
      {groups.map((group) => {
        const sectionAllowed = group.tools.filter((t) => isAllowed(t.id)).length
        return (
          <div key={group.id}>
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="flex items-center gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  {group.label}
                </p>
                {group.source === 'plugin' && (
                  <Badge variant="outline" className="text-[8px]">
                    plugin
                  </Badge>
                )}
              </div>
              <span className="text-[10px] text-muted-foreground/40">
                {sectionAllowed}/{group.tools.length}
              </span>
            </div>
            <fieldset
              className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 border-0 p-0 m-0"
              aria-label={`${group.label} tools`}
            >
              {group.tools.map((tool) => {
                const allowed = isAllowed(tool.id)
                const Icon = TOOL_ICONS[tool.id] ?? Terminal
                const pluginId = 'pluginId' in tool ? (tool as { pluginId?: string }).pluginId : undefined
                return (
                  <button
                    type="button"
                    key={tool.id}
                    onClick={() => toggleTool(tool.id)}
                    disabled={!editable}
                    title={tool.description}
                    aria-label={`${tool.id}: ${allowed ? 'enabled' : 'disabled'}. ${tool.description}`}
                    aria-pressed={allowed}
                    className={cn(
                      'flex flex-col items-center gap-2 rounded-xl border p-4',
                      'transition-all duration-200',
                      editable ? 'cursor-pointer' : 'cursor-not-allowed',
                      allowed
                        ? 'border-primary/20 bg-card/80 hover:border-primary/40 shadow-sm shadow-primary/5'
                        : 'border-border/30 bg-muted/20 opacity-40 hover:opacity-60',
                    )}
                  >
                    <div
                      className={cn(
                        'flex h-10 w-10 items-center justify-center rounded-lg',
                        allowed ? 'bg-primary/10' : 'bg-muted/50',
                      )}
                    >
                      <Icon className={cn('h-5 w-5', allowed ? 'text-primary' : 'text-muted-foreground/40')} />
                    </div>
                    <span
                      className={cn(
                        'font-mono text-[10px] text-center',
                        allowed ? 'text-foreground' : 'text-muted-foreground/40',
                      )}
                    >
                      {tool.id}
                    </span>
                    {pluginId && <span className="text-[8px] text-muted-foreground/40">{pluginId}</span>}
                    {allowed ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-muted-foreground/20" />
                    )}
                  </button>
                )
              })}
            </fieldset>
          </div>
        )
      })}

      {usingFallback && !catalogLoading && (
        <p className="text-center text-[10px] text-muted-foreground/40 pt-2">
          Showing fallback tool list. Plugin tools may not appear.
        </p>
      )}
    </div>
  )
}
