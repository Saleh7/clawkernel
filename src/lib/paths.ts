// ---------------------------------------------------------------------------
//  OpenClaw path helpers
//
//  VITE_OPENCLAW_HOME lets you override the OpenClaw home directory
//  (default: ~/.openclaw). This affects workspace path suggestions shown
//  in the UI — the actual resolved path always comes from the Gateway.
// ---------------------------------------------------------------------------

type RuntimeConfig = {
  openclawHome?: string
}

function getRuntimeConfig(): RuntimeConfig | undefined {
  const globalScope = globalThis as typeof globalThis & { __CK_CONFIG__?: RuntimeConfig }
  return globalScope.__CK_CONFIG__
}

function trimTrailingSlashes(pathValue: string): string {
  let end = pathValue.length
  while (end > 0 && pathValue[end - 1] === '/') {
    end -= 1
  }
  return pathValue.slice(0, end)
}

const OPENCLAW_HOME = trimTrailingSlashes(
  getRuntimeConfig()?.openclawHome ?? import.meta.env.VITE_OPENCLAW_HOME ?? '~/.openclaw',
)

/**
 * Returns the default workspace path suggestion for a given agent ID.
 * This is a UI hint only — the real path is resolved server-side.
 */
export function defaultWorkspacePath(agentId: string): string {
  return `${OPENCLAW_HOME}/workspace-${agentId}`
}
