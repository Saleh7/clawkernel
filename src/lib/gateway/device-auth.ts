// ---------------------------------------------------------------------------
//  Device Auth — payload builder for Gateway device authentication
//  Matches OpenClaw's gateway/device-auth.ts exactly.
//  The gateway always expects v2 format with a nonce.
// ---------------------------------------------------------------------------

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
