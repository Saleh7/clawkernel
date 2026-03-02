import { useCallback, useEffect, useState } from 'react'
import { patchConfigWithRetry } from '@/app/agents/config-utils'
import type { GatewayClient } from '@/lib/gateway/client'
import type { ConfigSnapshot, ModelCatalogEntry, ModelsListResult } from '@/lib/gateway/types'
import { createLogger } from '@/lib/logger'
import { useGatewayStore } from '@/stores/gateway-store'

const log = createLogger('models')

export type AgentModelConfig = string | { primary?: string; fallbacks?: string[] } | null | undefined

export function resolveModelPrimary(model: AgentModelConfig): string {
  if (!model) return '—'
  if (typeof model === 'string') return model || '—'
  return model.primary || '—'
}

export function resolveModelFallbacks(model: AgentModelConfig): string[] {
  if (!model || typeof model !== 'object') return []
  return Array.isArray(model.fallbacks) ? model.fallbacks.filter((f): f is string => typeof f === 'string') : []
}

export type CustomProvider = {
  id: string
  baseUrl: string
  hasApiKey: boolean
}

export function useModels() {
  const client = useGatewayStore((s) => s.client)
  const connected = useGatewayStore((s) => s.state === 'connected')
  const storeConfig = useGatewayStore((s) => s.config)
  const storeAgents = useGatewayStore((s) => s.agents)

  const [models, setModels] = useState<ModelCatalogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!client) return
    setLoading(true)
    try {
      const res = await client.request<ModelsListResult>('models.list', {})
      setModels(res.models ?? [])
    } catch (err) {
      log.warn('models.list failed', err)
    } finally {
      setLoading(false)
    }
  }, [client])

  useEffect(() => {
    if (connected) void refresh()
  }, [connected, refresh])

  // ---------------------------------------------------------------------------
  //  Derive routing + aliases from parsed config
  // ---------------------------------------------------------------------------

  const cfg = storeConfig?.config as
    | {
        agents?: {
          defaults?: {
            model?: AgentModelConfig
            imageModel?: AgentModelConfig
            models?: Record<string, { alias?: string } | null>
            heartbeat?: { model?: string | null }
          }
          list?: Array<{ id: string; model?: AgentModelConfig }>
        }
        models?: {
          providers?: Record<string, { apiKey?: string; baseUrl?: string } | null>
        }
      }
    | null
    | undefined

  const defaults = cfg?.agents?.defaults

  const defaultModel = defaults?.model ?? null
  const imageModel = defaults?.imageModel ?? null
  const heartbeatModel = defaults?.heartbeat?.model ?? null

  // All entries in agents.defaults.models (not just aliased ones)
  // Null entries are RFC 7396 delete markers — skip them
  const aliases: Array<{ modelId: string; alias: string }> = Object.entries(defaults?.models ?? {}).flatMap(
    ([id, v]) => {
      if (!v) return []
      return [{ modelId: id, alias: v.alias ?? '' }]
    },
  )

  // Custom providers from config (skip null RFC 7396 delete markers)
  const customProviders: CustomProvider[] = Object.entries(cfg?.models?.providers ?? {}).flatMap(([id, p]) => {
    if (!p) return []
    return [
      {
        id,
        baseUrl: p.baseUrl ?? '',
        hasApiKey: typeof p.apiKey === 'string' && p.apiKey.length > 0,
      },
    ]
  })

  const configAgentsList = cfg?.agents?.list ?? []
  const modelByAgent = new Map(configAgentsList.map((a) => [a.id, a.model]))
  const agentList = (storeAgents?.agents ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    model: modelByAgent.get(a.id) as AgentModelConfig | undefined,
  }))

  // ---------------------------------------------------------------------------
  //  Write helpers
  // ---------------------------------------------------------------------------

  const refreshGatewayConfig = useCallback(async () => {
    if (!client) return
    const freshConfig = await client.request<ConfigSnapshot>('config.get', {})
    useGatewayStore.getState().setConfig(freshConfig)
  }, [client])

  const withSave = useCallback(
    async (fn: (c: GatewayClient, cfg: ConfigSnapshot) => Promise<void>): Promise<void> => {
      const c = client
      const cfg = storeConfig
      if (!c || !cfg) return
      setSaving(true)
      setSaveError(null)
      try {
        await fn(c, cfg)
        await refresh()
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setSaveError(msg)
        log.error('Save failed', err)
        throw err
      } finally {
        setSaving(false)
      }
    },
    [client, storeConfig, refresh],
  )

  const setDefaultModel = useCallback(
    async (model: string): Promise<void> => {
      await withSave(async (c, cfg) => {
        const patch = { agents: { defaults: { model } } }
        await patchConfigWithRetry(c, cfg, JSON.stringify(patch))
        await refreshGatewayConfig()
      })
    },
    [withSave, refreshGatewayConfig],
  )

  const setDefaultModelWithFallbacks = useCallback(
    async (primary: string, fallbacks: string[]): Promise<void> => {
      await withSave(async (c, cfg) => {
        const patch = { agents: { defaults: { model: { primary, fallbacks } } } }
        await patchConfigWithRetry(c, cfg, JSON.stringify(patch))
        await refreshGatewayConfig()
      })
    },
    [withSave, refreshGatewayConfig],
  )

  const addDefaultFallback = useCallback(
    async (fallback: string): Promise<void> => {
      await withSave(async (c, cfg) => {
        const current = defaultModel
        const primary = typeof current === 'string' ? current : (current?.primary ?? '')
        const existingFallbacks = resolveModelFallbacks(current)
        const fallbacks = [...existingFallbacks, fallback]
        const patch = { agents: { defaults: { model: { primary, fallbacks } } } }
        await patchConfigWithRetry(c, cfg, JSON.stringify(patch))
        await refreshGatewayConfig()
      })
    },
    [withSave, refreshGatewayConfig, defaultModel],
  )

  const removeDefaultFallback = useCallback(
    async (fallback: string): Promise<void> => {
      await withSave(async (c, cfg) => {
        const current = defaultModel
        const primary = typeof current === 'string' ? current : (current?.primary ?? '')
        const existingFallbacks = resolveModelFallbacks(current)
        const fallbacks = existingFallbacks.filter((f) => f !== fallback)
        const patch =
          fallbacks.length > 0
            ? { agents: { defaults: { model: { primary, fallbacks } } } }
            : { agents: { defaults: { model: primary } } }
        await patchConfigWithRetry(c, cfg, JSON.stringify(patch))
        await refreshGatewayConfig()
      })
    },
    [withSave, refreshGatewayConfig, defaultModel],
  )

  const setImageModel = useCallback(
    async (model: string): Promise<void> => {
      await withSave(async (c, cfg) => {
        const patch = { agents: { defaults: { imageModel: model } } }
        await patchConfigWithRetry(c, cfg, JSON.stringify(patch))
        await refreshGatewayConfig()
      })
    },
    [withSave, refreshGatewayConfig],
  )

  const addImageFallback = useCallback(
    async (fallback: string): Promise<void> => {
      await withSave(async (c, cfg) => {
        const current = imageModel
        const primary = typeof current === 'string' ? current : (current?.primary ?? '')
        const existingFallbacks = resolveModelFallbacks(current)
        const fallbacks = [...existingFallbacks, fallback]
        const patch = { agents: { defaults: { imageModel: { primary, fallbacks } } } }
        await patchConfigWithRetry(c, cfg, JSON.stringify(patch))
        await refreshGatewayConfig()
      })
    },
    [withSave, refreshGatewayConfig, imageModel],
  )

  const removeImageFallback = useCallback(
    async (fallback: string): Promise<void> => {
      await withSave(async (c, cfg) => {
        const current = imageModel
        const primary = typeof current === 'string' ? current : (current?.primary ?? '')
        const existingFallbacks = resolveModelFallbacks(current)
        const fallbacks = existingFallbacks.filter((f) => f !== fallback)
        const patch =
          fallbacks.length > 0
            ? { agents: { defaults: { imageModel: { primary, fallbacks } } } }
            : { agents: { defaults: { imageModel: primary } } }
        await patchConfigWithRetry(c, cfg, JSON.stringify(patch))
        await refreshGatewayConfig()
      })
    },
    [withSave, refreshGatewayConfig, imageModel],
  )

  const addAlias = useCallback(
    async (modelId: string, alias: string): Promise<void> => {
      await withSave(async (c, cfg) => {
        // alias="" means add to allowlist with no alias; store as empty-object entry
        const entry = alias ? { alias } : {}
        const patch = { agents: { defaults: { models: { [modelId]: entry } } } }
        await patchConfigWithRetry(c, cfg, JSON.stringify(patch))
        await refreshGatewayConfig()
      })
    },
    [withSave, refreshGatewayConfig],
  )

  const removeAlias = useCallback(
    async (modelId: string): Promise<void> => {
      await withSave(async (c, cfg) => {
        // RFC 7396 — null deletes the key
        const patch = { agents: { defaults: { models: { [modelId]: null } } } }
        await patchConfigWithRetry(c, cfg, JSON.stringify(patch))
        await refreshGatewayConfig()
      })
    },
    [withSave, refreshGatewayConfig],
  )

  const setAgentModel = useCallback(
    async (agentId: string, model: string | null): Promise<void> => {
      await withSave(async (c, cfg) => {
        const raw = JSON.stringify({ agents: { list: [{ id: agentId, model }] } })
        await patchConfigWithRetry(c, cfg, raw)
        await refreshGatewayConfig()
      })
    },
    [withSave, refreshGatewayConfig],
  )

  const setHeartbeatModel = useCallback(
    async (model: string | null): Promise<void> => {
      await withSave(async (c, cfg) => {
        const raw = JSON.stringify({ agents: { defaults: { heartbeat: { model } } } })
        await patchConfigWithRetry(c, cfg, raw)
        await refreshGatewayConfig()
      })
    },
    [withSave, refreshGatewayConfig],
  )

  const addCustomProvider = useCallback(
    async (id: string, baseUrl: string, apiKey: string): Promise<void> => {
      await withSave(async (c, cfg) => {
        const providerEntry = apiKey ? { baseUrl, apiKey, models: [] } : { baseUrl, models: [] }
        const raw = JSON.stringify({ models: { providers: { [id]: providerEntry } } })
        await patchConfigWithRetry(c, cfg, raw)
        await refreshGatewayConfig()
      })
    },
    [withSave, refreshGatewayConfig],
  )

  const removeCustomProvider = useCallback(
    async (id: string): Promise<void> => {
      await withSave(async (c, cfg) => {
        // RFC 7396 — null deletes the key
        const raw = JSON.stringify({ models: { providers: { [id]: null } } })
        await patchConfigWithRetry(c, cfg, raw)
        await refreshGatewayConfig()
      })
    },
    [withSave, refreshGatewayConfig],
  )

  const editCustomProvider = useCallback(
    async (id: string, baseUrl: string, apiKey: string): Promise<void> => {
      await withSave(async (c, cfg) => {
        // Only patch baseUrl and apiKey — do NOT overwrite models[]
        const entry: Record<string, string> = { baseUrl }
        if (apiKey) entry.apiKey = apiKey
        const raw = JSON.stringify({ models: { providers: { [id]: entry } } })
        await patchConfigWithRetry(c, cfg, raw)
        await refreshGatewayConfig()
      })
    },
    [withSave, refreshGatewayConfig],
  )

  return {
    models,
    loading,
    refresh,
    defaultModel,
    imageModel,
    aliases,
    customProviders,
    saving,
    saveError,
    setDefaultModel,
    setDefaultModelWithFallbacks,
    addDefaultFallback,
    removeDefaultFallback,
    setImageModel,
    addImageFallback,
    removeImageFallback,
    addAlias,
    removeAlias,
    agentList,
    setAgentModel,
    heartbeatModel,
    setHeartbeatModel,
    addCustomProvider,
    removeCustomProvider,
    editCustomProvider,
  }
}
