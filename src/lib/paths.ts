// ---------------------------------------------------------------------------
//  OpenClaw path helpers
//
//  VITE_OPENCLAW_HOME lets you override the OpenClaw home directory
//  (default: ~/.openclaw). This affects workspace path suggestions shown
//  in the UI — the actual resolved path always comes from the Gateway.
// ---------------------------------------------------------------------------

const OPENCLAW_HOME = (
  window.__CK_CONFIG__?.openclawHome ??
  import.meta.env.VITE_OPENCLAW_HOME ??
  '~/.openclaw'
).replace(/\/+$/, '')

/**
 * Returns the default workspace path suggestion for a given agent ID.
 * This is a UI hint only — the real path is resolved server-side.
 */
export function defaultWorkspacePath(agentId: string): string {
  return `${OPENCLAW_HOME}/workspace-${agentId}`
}
