// ---------------------------------------------------------------------------
//  Shared types for agent pages
// ---------------------------------------------------------------------------

/** Binding entry linking an agent to a channel match pattern */
export type AgentBinding = {
  agentId: string
  match: {
    channel: string
    accountId?: string
    peer?: { kind: string; id: string }
    guildId?: string
    teamId?: string
    roles?: string[]
    [key: string]: unknown
  }
  [key: string]: unknown
}

/** Parsed OpenClaw config — typed subset used across agent pages */
export type ParsedConfig = {
  agents?: {
    defaults?: {
      workspace?: string
      model?: unknown
      models?: Record<string, { alias?: string }>
      tools?: { profile?: string; allow?: string[]; alsoAllow?: string[]; deny?: string[] }
      [key: string]: unknown
    }
    list?: Array<{
      id: string
      workspace?: string
      model?: unknown
      skills?: string[]
      tools?: { profile?: string; allow?: string[]; alsoAllow?: string[]; deny?: string[] }
      [key: string]: unknown
    }>
  }
  tools?: { profile?: string; allow?: string[]; alsoAllow?: string[]; deny?: string[] }
  bindings?: AgentBinding[]
}
