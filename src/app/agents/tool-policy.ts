//  Tool policy engine — matches OpenClaw's tool-policy-shared.ts behavior

const TOOL_NAME_ALIASES: Record<string, string> = {
  bash: 'exec',
  'apply-patch': 'apply_patch',
}

export function normalizeToolName(name: string): string {
  const normalized = name.trim().toLowerCase()
  return TOOL_NAME_ALIASES[normalized] ?? normalized
}

const TOOL_GROUPS: Record<string, string[]> = {
  'group:openclaw': [
    'web_search',
    'web_fetch',
    'memory_search',
    'memory_get',
    'sessions_list',
    'sessions_history',
    'sessions_send',
    'sessions_spawn',
    'subagents',
    'session_status',
    'browser',
    'canvas',
    'message',
    'cron',
    'gateway',
    'nodes',
    'agents_list',
    'image',
    'tts',
  ],
  'group:fs': ['read', 'write', 'edit', 'apply_patch'],
  'group:runtime': ['exec', 'process'],
  'group:web': ['web_search', 'web_fetch'],
  'group:memory': ['memory_search', 'memory_get'],
  'group:sessions': [
    'sessions_list',
    'sessions_history',
    'sessions_send',
    'sessions_spawn',
    'subagents',
    'session_status',
  ],
  'group:ui': ['browser', 'canvas'],
  'group:messaging': ['message'],
  'group:automation': ['cron', 'gateway'],
  'group:nodes': ['nodes'],
  'group:agents': ['agents_list'],
  'group:media': ['image', 'tts'],
}

/** Expand group:* references and normalize tool names */
function expandToolGroups(list: string[]): string[] {
  const normalized = list.map(normalizeToolName).filter(Boolean)
  const expanded: string[] = []
  for (const value of normalized) {
    const group = TOOL_GROUPS[value]
    if (group) {
      expanded.push(...group)
    } else {
      expanded.push(value)
    }
  }
  return [...new Set(expanded)]
}

type CompiledPattern = { kind: 'all' } | { kind: 'exact'; value: string } | { kind: 'regex'; value: RegExp }

function compilePattern(pattern: string): CompiledPattern {
  const normalized = normalizeToolName(pattern)
  if (!normalized) return { kind: 'exact', value: '' }
  if (normalized === '*') return { kind: 'all' }
  if (!normalized.includes('*')) return { kind: 'exact', value: normalized }
  const escaped = normalized.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)
  const wildcardPattern = escaped.replaceAll(String.raw`\*`, '.*')
  return { kind: 'regex', value: new RegExp(`^${wildcardPattern}$`) }
}

function compilePatterns(patterns?: string[]): CompiledPattern[] {
  if (!Array.isArray(patterns)) return []
  return expandToolGroups(patterns)
    .map(compilePattern)
    .filter((p) => p.kind !== 'exact' || p.value.length > 0)
}

function matchesAny(name: string, patterns: CompiledPattern[]): boolean {
  for (const p of patterns) {
    if (p.kind === 'all') return true
    if (p.kind === 'exact' && name === p.value) return true
    if (p.kind === 'regex' && p.value.test(name)) return true
  }
  return false
}

/** Check if a tool name matches a list (with group expansion + glob) */
function matchesList(name: string, list?: string[]): boolean {
  if (!Array.isArray(list) || list.length === 0) return false
  const normalized = normalizeToolName(name)
  const patterns = compilePatterns(list)
  if (matchesAny(normalized, patterns)) return true
  // apply_patch inherits from exec
  if (normalized === 'apply_patch' && matchesAny('exec', patterns)) return true
  return false
}

type ToolPolicy = { allow?: string[]; deny?: string[] }

const PROFILE_POLICIES: Record<string, ToolPolicy> = {
  minimal: { allow: ['session_status'] },
  coding: {
    allow: [
      'read',
      'write',
      'edit',
      'apply_patch',
      'exec',
      'process',
      'memory_search',
      'memory_get',
      'sessions_list',
      'sessions_history',
      'sessions_send',
      'sessions_spawn',
      'subagents',
      'session_status',
      'cron',
      'image',
    ],
  },
  messaging: {
    allow: ['sessions_list', 'sessions_history', 'sessions_send', 'session_status', 'message'],
  },
  full: {},
}

export function resolveToolProfilePolicy(profile: string): ToolPolicy | undefined {
  return PROFILE_POLICIES[profile]
}

/** Check if a tool is allowed by a base policy (profile or explicit allow/deny) */
function isAllowedByPolicy(name: string, policy?: ToolPolicy): boolean {
  if (!policy) return true
  const normalized = normalizeToolName(name)
  const deny = compilePatterns(policy.deny)
  if (matchesAny(normalized, deny)) return false
  const allow = compilePatterns(policy.allow)
  if (allow.length === 0) return true
  if (matchesAny(normalized, allow)) return true
  if (normalized === 'apply_patch' && matchesAny('exec', allow)) return true
  return false
}

type ToolAllowedResult = {
  allowed: boolean
  baseAllowed: boolean
  denied: boolean
}

export function resolveToolAllowed(
  toolId: string,
  basePolicy: ToolPolicy | undefined,
  alsoAllow: string[],
  deny: string[],
): ToolAllowedResult {
  const baseAllowed = isAllowedByPolicy(toolId, basePolicy)
  const extraAllowed = matchesList(toolId, alsoAllow)
  const denied = matchesList(toolId, deny)
  const allowed = (baseAllowed || extraAllowed) && !denied
  return { allowed, baseAllowed, denied }
}
