import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { patchConfigWithRetry } from '@/app/agents/config-utils'
import type {
  ConfigSnapshot,
  TalkConfigResult,
  TtsConvertResult,
  TtsProvidersResult,
  TtsStatus,
  VoiceWakeResult,
} from '@/lib/gateway/types'
import { createLogger } from '@/lib/logger'
import { useGatewayStore } from '@/stores/gateway-store'
import type { AudioState, TtsTestResult } from '../types'

const log = createLogger('audio')

export function useAudio() {
  const client = useGatewayStore((s) => s.client)
  const connected = useGatewayStore((s) => s.state === 'connected')
  const storeConfig = useGatewayStore((s) => s.config)

  const [state, setState] = useState<AudioState | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [converting, setConverting] = useState(false)

  const refresh = useCallback(async () => {
    if (!client) return
    setLoading(true)
    try {
      const [statusRes, providersRes, talkRes, wakeRes] = await Promise.all([
        client.request<TtsStatus>('tts.status', {}),
        client.request<TtsProvidersResult>('tts.providers', {}),
        client.request<TalkConfigResult>('talk.config', {}),
        client.request<VoiceWakeResult>('voicewake.get', {}),
      ])

      setState({
        status: statusRes,
        providers: providersRes.providers ?? [],
        activeProvider: providersRes.active ?? '',
        talk: talkRes.config?.talk ?? null,
        seamColor: talkRes.config?.ui?.seamColor ?? null,
        wakeTriggers: wakeRes.triggers ?? [],
      })
    } catch (err) {
      log.warn('audio fetch failed', err)
      toast.error('Failed to load audio configuration')
    } finally {
      setLoading(false)
    }
  }, [client])

  const refreshGatewayConfig = useCallback(async () => {
    if (!client) return
    const freshConfig = await client.request<ConfigSnapshot>('config.get', {})
    useGatewayStore.getState().setConfig(freshConfig)
  }, [client])

  useEffect(() => {
    if (connected) void refresh()
  }, [connected, refresh])

  const handleToggleEnabled = useCallback(
    async (enabled: boolean) => {
      if (!client || saving) return
      setSaving(true)
      setState((prev) =>
        prev ? { ...prev, status: { ...prev.status, enabled, auto: enabled ? 'always' : 'off' } } : prev,
      )
      try {
        await client.request(enabled ? 'tts.enable' : 'tts.disable', {})
        toast.success(`TTS ${enabled ? 'enabled' : 'disabled'}`)
        await refresh()
      } catch (err) {
        log.error('tts enable/disable failed', err)
        toast.error('Failed to update TTS')
        await refresh()
      } finally {
        setSaving(false)
      }
    },
    [client, saving, refresh],
  )

  const handleSetProvider = useCallback(
    async (provider: string) => {
      if (!client || saving) return
      setSaving(true)
      setState((prev) => (prev ? { ...prev, activeProvider: provider } : prev))
      try {
        await client.request('tts.setProvider', { provider })
        toast.success(`Provider set to ${provider}`)
        await refresh()
      } catch (err) {
        log.error('tts.setProvider failed', err)
        toast.error('Failed to set provider')
        await refresh()
      } finally {
        setSaving(false)
      }
    },
    [client, saving, refresh],
  )

  const handleConvert = useCallback(
    async (text: string): Promise<TtsTestResult | null> => {
      if (!client || converting) return null
      const trimmed = text.trim()
      if (!trimmed) {
        toast.error('Text is required')
        return null
      }
      setConverting(true)
      try {
        const res = await client.request<TtsConvertResult>('tts.convert', { text: trimmed })
        return {
          audioPath: res.audioPath,
          provider: res.provider,
          outputFormat: res.outputFormat,
          voiceCompatible: res.voiceCompatible,
        }
      } catch (err) {
        log.error('tts.convert failed', err)
        toast.error('TTS conversion failed')
        return null
      } finally {
        setConverting(false)
      }
    },
    [client, converting],
  )

  const handleSetWakeTriggers = useCallback(
    async (triggers: string[]) => {
      if (!client || saving) return
      setSaving(true)
      setState((prev) => (prev ? { ...prev, wakeTriggers: triggers } : prev))
      try {
        const res = await client.request<VoiceWakeResult>('voicewake.set', { triggers })
        setState((prev) => (prev ? { ...prev, wakeTriggers: res.triggers ?? triggers } : prev))
        toast.success('Wake word triggers saved')
      } catch (err) {
        log.error('voicewake.set failed', err)
        toast.error('Failed to save wake word triggers')
        await refresh()
      } finally {
        setSaving(false)
      }
    },
    [client, saving, refresh],
  )

  const handleUpdateTtsConfig = useCallback(
    async (patch: { summarize?: boolean; maxTextLength?: number }) => {
      if (!client || !storeConfig || saving) return
      setSaving(true)
      try {
        await patchConfigWithRetry(client, storeConfig, JSON.stringify({ messages: { tts: patch } }))
        await refreshGatewayConfig()
        toast.success('TTS settings saved')
      } catch (err) {
        log.error('tts config patch failed', err)
        toast.error('Failed to save TTS settings')
        // Best-effort revert: re-sync storeConfig so TtsSettingsCard useEffect
        // corrects any optimistic UI changes (e.g. summarize toggle).
        try {
          await refreshGatewayConfig()
        } catch {
          // Revert is best-effort; original error already surfaced above
        }
      } finally {
        setSaving(false)
      }
    },
    [client, storeConfig, saving, refreshGatewayConfig],
  )

  return {
    state,
    storeConfig,
    loading,
    saving,
    converting,
    refresh,
    handleToggleEnabled,
    handleSetProvider,
    handleConvert,
    handleSetWakeTriggers,
    handleUpdateTtsConfig,
  }
}
