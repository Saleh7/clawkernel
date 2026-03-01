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

function loadSettings(): GatewaySettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as GatewaySettings
      if (parsed.url) return parsed
    }
  } catch {
    // ignore
  }
  return {
    url: window.__CK_CONFIG__?.gatewayUrl ?? import.meta.env.VITE_GATEWAY_URL ?? 'ws://localhost:18789',
    token: window.__CK_CONFIG__?.gatewayToken ?? import.meta.env.VITE_GATEWAY_TOKEN ?? '',
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
