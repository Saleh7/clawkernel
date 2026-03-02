import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { SkillStatusReport } from '@/lib/gateway/types'
import { createLogger } from '@/lib/logger'
import { useGatewayStore } from '@/stores/gateway-store'

const log = createLogger('skills')

export type SkillFilter = 'all' | 'ready' | 'needs-setup' | 'blocked'

export function useSkills() {
  const client = useGatewayStore((s) => s.client)
  const connected = useGatewayStore((s) => s.state === 'connected')
  const agents = useGatewayStore((s) => s.agents)

  const [report, setReport] = useState<SkillStatusReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [agentId, setAgentId] = useState<string>('')

  const agentList = agents?.agents ?? []

  const refresh = useCallback(async () => {
    if (!client) return
    setLoading(true)
    try {
      const res = await client.request<SkillStatusReport>('skills.status', agentId ? { agentId } : {})
      setReport(res)
    } catch (err) {
      log.warn('skills.status failed', err)
    } finally {
      setLoading(false)
    }
  }, [client, agentId])

  useEffect(() => {
    if (connected) void refresh()
  }, [connected, refresh])

  const handleToggle = useCallback(
    async (skillKey: string, enabled: boolean) => {
      if (!client || busyKey) return
      setBusyKey(skillKey)
      try {
        await client.request('skills.update', { skillKey, enabled })
        await refresh()
        toast.success(`Skill ${enabled ? 'enabled' : 'disabled'}`)
      } catch (err) {
        log.error('skills.update failed', err)
        toast.error('Failed to update skill')
      } finally {
        setBusyKey(null)
      }
    },
    [client, busyKey, refresh],
  )

  const handleSetApiKey = useCallback(
    async (skillKey: string, apiKey: string) => {
      if (!client || busyKey) return
      setBusyKey(skillKey)
      try {
        await client.request('skills.update', { skillKey, apiKey })
        await refresh()
        toast.success('API key saved')
      } catch (err) {
        log.error('skills.update (apiKey) failed', err)
        toast.error('Failed to save API key')
      } finally {
        setBusyKey(null)
      }
    },
    [client, busyKey, refresh],
  )

  const handleInstall = useCallback(
    async (name: string, installId: string) => {
      if (!client || busyKey) return
      setBusyKey(`install:${name}:${installId}`)
      toast.info('Installing dependency…')
      try {
        const res = await client.request<{ ok: boolean; message: string }>('skills.install', {
          name,
          installId,
          timeoutMs: 120_000,
        })
        if (res.ok) {
          toast.success('Dependency installed')
          await refresh()
        } else {
          toast.error(res.message || 'Install failed')
        }
      } catch (err) {
        log.error('skills.install failed', err)
        toast.error('Failed to install dependency')
      } finally {
        setBusyKey(null)
      }
    },
    [client, busyKey, refresh],
  )

  return {
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
  }
}
