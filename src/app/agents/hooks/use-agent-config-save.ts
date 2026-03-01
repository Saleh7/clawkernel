import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { useUnsavedWarning } from '@/hooks/use-unsaved-warning'
import type { GatewayClient } from '@/lib/gateway/client'
import type { ConfigSnapshot } from '@/lib/gateway/types'
import { createLogger } from '@/lib/logger'
import { useGatewayStore } from '@/stores/gateway-store'
import { saveConfigWithRetry } from '../config-utils'

const log = createLogger('agents:config-save')

interface UseAgentConfigSaveOptions {
  client: GatewayClient | null
  config: ConfigSnapshot | null
  agentId: string
  isDirty: boolean
  patcher: (entry: Record<string, unknown>) => Record<string, unknown>
  messages: {
    saveError: string
    applySuccess: string
    applyError: string
  }
}

interface UseAgentConfigSaveResult {
  saving: boolean
  save: () => Promise<void>
  saveAndApply: () => Promise<void>
}

export function useAgentConfigSave({
  client,
  config,
  agentId,
  isDirty,
  patcher,
  messages,
}: UseAgentConfigSaveOptions): UseAgentConfigSaveResult {
  const [saving, setSaving] = useState(false)

  const save = useCallback(async () => {
    if (!client || !config) return
    setSaving(true)
    try {
      const fresh = await saveConfigWithRetry(client, config, agentId, patcher, 'config.set')
      useGatewayStore.getState().setConfig(fresh)
    } catch (err) {
      log.error('Save config failed', err)
      toast.error(messages.saveError)
    } finally {
      setSaving(false)
    }
  }, [client, config, agentId, patcher, messages.saveError])

  const saveAndApply = useCallback(async () => {
    if (!client || !config) return
    setSaving(true)
    try {
      const fresh = await saveConfigWithRetry(client, config, agentId, patcher, 'config.apply')
      useGatewayStore.getState().setConfig(fresh)
      toast.success(messages.applySuccess)
    } catch (err) {
      log.error('Save & apply config failed', err)
      toast.error(messages.applyError)
    } finally {
      setSaving(false)
    }
  }, [client, config, agentId, patcher, messages.applySuccess, messages.applyError])

  useUnsavedWarning(isDirty, isDirty ? () => void save() : undefined)

  return { saving, save, saveAndApply }
}
