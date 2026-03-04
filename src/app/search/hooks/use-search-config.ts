import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { patchConfigWithRetry } from '@/app/agents/config-utils'
import type { ConfigSnapshot } from '@/lib/gateway/types'
import { createLogger } from '@/lib/logger'
import { useGatewayStore } from '@/stores/gateway-store'
import type { WebSearchConfig } from '../types'

const log = createLogger('search:config')

function extractWebSearch(cfg: ConfigSnapshot): WebSearchConfig {
  const raw = (cfg.config as Record<string, unknown>) ?? {}
  const toolsWeb = (raw.tools as Record<string, unknown>)?.web as Record<string, unknown> | undefined
  return (toolsWeb?.search ?? {}) as WebSearchConfig
}

export function useSearchConfig() {
  const client = useGatewayStore((s) => s.client)
  const connected = useGatewayStore((s) => s.state === 'connected')
  const storeConfig = useGatewayStore((s) => s.config)

  const [webSearch, setWebSearch] = useState<WebSearchConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const refresh = useCallback(async () => {
    if (!client) return
    setLoading(true)
    setLoadError(null)
    try {
      const cfg = await client.request<ConfigSnapshot>('config.get', {})
      useGatewayStore.getState().setConfig(cfg)
      setWebSearch(extractWebSearch(cfg))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log.warn('search config fetch failed', err)
      setLoadError(msg)
      toast.error('Failed to load search configuration')
    } finally {
      setLoading(false)
    }
  }, [client])

  useEffect(() => {
    if (connected) void refresh()
  }, [connected, refresh])

  // Keep in sync when store config changes (e.g. after a patch or gateway snapshot update)
  useEffect(() => {
    if (!storeConfig) return
    setWebSearch(extractWebSearch(storeConfig))
  }, [storeConfig])

  const handleSaveModel = useCallback(
    async (provider: string, model: string) => {
      if (!client || !storeConfig || saving) return
      setSaving(true)
      try {
        const raw = JSON.stringify({ tools: { web: { search: { [provider]: { model } } } } })
        await patchConfigWithRetry(client, storeConfig, raw)
        const freshCfg = await client.request<ConfigSnapshot>('config.get', {})
        useGatewayStore.getState().setConfig(freshCfg)
        setWebSearch(extractWebSearch(freshCfg))
        toast.success('Model updated')
      } catch (err) {
        log.error('save model failed', err)
        toast.error('Failed to update model')
      } finally {
        setSaving(false)
      }
    },
    [client, storeConfig, saving],
  )

  return { webSearch, loading, loadError, saving, refresh, handleSaveModel }
}
