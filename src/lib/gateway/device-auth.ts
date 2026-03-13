//  Device Auth — payload builders for Gateway device authentication
//  Source: OpenClaw src/gateway/device-auth.ts
//  Server tries v3 first, falls back to v2.
//  Source: OpenClaw src/gateway/server/ws-connection/message-handler.ts:176-204

type DeviceAuthPayloadParams = {
  deviceId: string
  clientId: string
  clientMode: string
  role: string
  scopes: string[]
  signedAtMs: number
  token?: string | null
  nonce: string
}

type DeviceAuthPayloadV3Params = DeviceAuthPayloadParams & {
  platform?: string | null
  deviceFamily?: string | null
}

/**
 * Normalize metadata for auth payload — matches upstream behavior.
 * Source: OpenClaw src/gateway/device-metadata-normalization.ts
 */
function normalizeDeviceMetadataForAuth(value?: string | null): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed) return ''
  // ASCII-only lowercase — matches upstream toLowerAscii semantics.
  return trimmed.replaceAll(/[A-Z]/g, (char) => {
    const code = char.codePointAt(0)
    return code === undefined ? char : String.fromCodePoint(code + 32)
  })
}

// Kept for potential v2 fallback — currently unused (v3 is active).
// Server tries v3 first, falls back to v2.
// Source: OpenClaw src/gateway/server/ws-connection/message-handler.ts:176-204
export function buildDeviceAuthPayload(params: DeviceAuthPayloadParams): string {
  const scopes = params.scopes.join(',')
  const token = params.token ?? ''
  return [
    'v2',
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    scopes,
    String(params.signedAtMs),
    token,
    params.nonce,
  ].join('|')
}

export function buildDeviceAuthPayloadV3(params: DeviceAuthPayloadV3Params): string {
  const scopes = params.scopes.join(',')
  const token = params.token ?? ''
  const platform = normalizeDeviceMetadataForAuth(params.platform)
  const deviceFamily = normalizeDeviceMetadataForAuth(params.deviceFamily)
  return [
    'v3',
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    scopes,
    String(params.signedAtMs),
    token,
    params.nonce,
    platform,
    deviceFamily,
  ].join('|')
}
