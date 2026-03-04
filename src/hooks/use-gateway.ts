/**
 * useGateway — Connect to OpenClaw Gateway on mount
 */

import { useEffect } from 'react'
import { useGatewayStore } from '@/stores/gateway-store'

const SETTINGS_KEY = 'clawkernel-gateway'

type GatewaySettings = {
  url: string
  token?: string
  password?: string
}

type RuntimeConfig = {
  gatewayUrl?: string
  gatewayToken?: string
}

function getRuntimeConfig(): RuntimeConfig | undefined {
  const globalScope = globalThis as typeof globalThis & { __CK_CONFIG__?: RuntimeConfig }
  return globalScope.__CK_CONFIG__
}

function loadSettings(): GatewaySettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as GatewaySettings
      if (parsed.url) return parsed
    }
  } catch {}
  const runtimeConfig = getRuntimeConfig()

  return {
    url: runtimeConfig?.gatewayUrl ?? import.meta.env.VITE_GATEWAY_URL ?? 'ws://localhost:18789',
    token: runtimeConfig?.gatewayToken ?? import.meta.env.VITE_GATEWAY_TOKEN ?? '',
  }
}

// Stable for the lifetime of this page — matches OpenClaw UI's behavior.
const instanceId = crypto.randomUUID()

export function useGateway() {
  const connect = useGatewayStore((s) => s.connect)
  const disconnect = useGatewayStore((s) => s.disconnect)

  useEffect(() => {
    const settings = loadSettings()
    connect({
      url: settings.url,
      token: settings.token,
      password: settings.password,
      clientName: 'ClawKernel',
      instanceId,
    })

    return () => {
      disconnect()
    }
  }, [connect, disconnect])
}
