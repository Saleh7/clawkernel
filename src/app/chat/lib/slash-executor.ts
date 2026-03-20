// Client-side slash command executor — calls Gateway RPC directly

import { formatTokens } from '@/lib/format'
import type { GatewayClient } from '@/lib/gateway/client'
import type { AgentsListResult, GatewaySessionRow, ModelsListResult, SessionsListResult } from '@/lib/gateway/types'
import { SLASH_COMMANDS } from './slash-commands'

type SlashResult = {
  content: string
  action?: 'refresh' | 'export' | 'new-session' | 'reset' | 'stop' | 'clear'
}

export async function executeSlashCommand(
  client: GatewayClient,
  sessionKey: string,
  name: string,
  args: string,
): Promise<SlashResult> {
  switch (name) {
    case 'help':
      return execHelp()
    case 'new':
      return { content: 'Starting new session…', action: 'new-session' }
    case 'reset':
      return { content: 'Resetting session…', action: 'reset' }
    case 'stop':
      return { content: 'Stopping current run…', action: 'stop' }
    case 'clear':
      return { content: 'Chat display cleared.', action: 'clear' }
    case 'export':
      return { content: 'Exporting session…', action: 'export' }
    case 'compact':
      return execCompact(client, sessionKey)
    case 'model':
      return execModel(client, sessionKey, args)
    case 'think':
      return execThink(client, sessionKey, args)
    case 'fast':
      return execFast(client, sessionKey, args)
    case 'verbose':
      return execVerbose(client, sessionKey, args)
    case 'usage':
      return execUsage(client, sessionKey)
    case 'agents':
      return execAgents(client)
    case 'kill':
      return execKill(client, sessionKey, args)
    default:
      return { content: `Unknown command: \`/${name}\`` }
  }
}

async function findSession(client: GatewayClient, sessionKey: string): Promise<GatewaySessionRow | undefined> {
  const r = await client.request<SessionsListResult>('sessions.list', {})
  return r?.sessions?.find((s) => s.key === sessionKey)
}

function execHelp(): SlashResult {
  const lines = ['**Available Commands**\n']
  let cat = ''
  for (const cmd of SLASH_COMMANDS) {
    if (cmd.category !== cat) {
      cat = cmd.category
      lines.push(`**${cat.charAt(0).toUpperCase() + cat.slice(1)}**`)
    }
    const a = cmd.args ? ` ${cmd.args}` : ''
    const l = cmd.local ? '' : ' *(agent)*'
    lines.push(`\`/${cmd.name}${a}\` — ${cmd.desc}${l}`)
  }
  lines.push('\nType `/` to open the command menu.')
  return { content: lines.join('\n') }
}

async function execCompact(client: GatewayClient, sk: string): Promise<SlashResult> {
  try {
    await client.request('sessions.compact', { key: sk })
    return { content: 'Context compacted successfully.', action: 'refresh' }
  } catch (e) {
    return { content: `Compaction failed: ${e}` }
  }
}

async function execModel(client: GatewayClient, sk: string, args: string): Promise<SlashResult> {
  if (!args) {
    try {
      const [sessions, models] = await Promise.all([
        client.request<SessionsListResult>('sessions.list', {}),
        client.request<ModelsListResult>('models.list', {}),
      ])
      const session = sessions?.sessions?.find((s) => s.key === sk)
      const model = session?.model || sessions?.defaults?.model || 'default'
      const available = models?.models?.map((m) => m.id) ?? []
      const lines = [`**Current model:** \`${model}\``]
      if (available.length > 0) {
        const shown = available
          .slice(0, 10)
          .map((m) => `\`${m}\``)
          .join(', ')
        const extra = available.length > 10 ? ` +${available.length - 10} more` : ''
        lines.push(`**Available:** ${shown}${extra}`)
      }
      return { content: lines.join('\n') }
    } catch (e) {
      return { content: `Failed to get model info: ${e}` }
    }
  }
  try {
    await client.request('sessions.patch', { key: sk, model: args.trim() })
    return { content: `Model set to \`${args.trim()}\`.`, action: 'refresh' }
  } catch (e) {
    return { content: `Failed to set model: ${e}` }
  }
}

async function execThink(client: GatewayClient, sk: string, args: string): Promise<SlashResult> {
  const level = args.trim().toLowerCase()
  if (!level) {
    const session = await findSession(client, sk)
    return { content: `Current thinking: **${session?.thinkingLevel || 'off'}**.\nOptions: off, low, medium, high.` }
  }
  if (!['off', 'low', 'medium', 'high'].includes(level)) {
    return { content: `Invalid level "${args.trim()}". Options: off, low, medium, high.` }
  }
  try {
    await client.request('sessions.patch', { key: sk, thinkingLevel: level })
    return { content: `Thinking set to **${level}**.`, action: 'refresh' }
  } catch (e) {
    return { content: `Failed: ${e}` }
  }
}

async function execFast(client: GatewayClient, sk: string, args: string): Promise<SlashResult> {
  const mode = args.trim().toLowerCase()
  if (!mode || mode === 'status') {
    const session = await findSession(client, sk)
    return { content: `Fast mode: **${session?.fastMode ? 'on' : 'off'}**.\nOptions: status, on, off.` }
  }
  if (mode !== 'on' && mode !== 'off') return { content: `Invalid: "${args.trim()}". Use on or off.` }
  try {
    await client.request('sessions.patch', { key: sk, fastMode: mode === 'on' })
    return { content: `Fast mode ${mode === 'on' ? 'enabled' : 'disabled'}.`, action: 'refresh' }
  } catch (e) {
    return { content: `Failed: ${e}` }
  }
}

async function execVerbose(client: GatewayClient, sk: string, args: string): Promise<SlashResult> {
  const level = args.trim().toLowerCase()
  if (!level) {
    const session = await findSession(client, sk)
    return { content: `Verbose: **${session?.verboseLevel || 'off'}**.\nOptions: on, off, full.` }
  }
  if (!['on', 'off', 'full'].includes(level)) return { content: `Invalid: "${args.trim()}". Use on, off, full.` }
  try {
    await client.request('sessions.patch', { key: sk, verboseLevel: level })
    return { content: `Verbose mode set to **${level}**.`, action: 'refresh' }
  } catch (e) {
    return { content: `Failed: ${e}` }
  }
}

async function execUsage(client: GatewayClient, sk: string): Promise<SlashResult> {
  try {
    const session = await findSession(client, sk)
    if (!session) return { content: 'No active session.' }
    const input = session.inputTokens ?? 0
    const output = session.outputTokens ?? 0
    const total = session.totalTokens ?? input + output
    const ctx = session.contextTokens ?? 0
    const pct = ctx > 0 ? Math.round((input / ctx) * 100) : null
    const lines = [
      '**Session Usage**',
      `Input: **${formatTokens(input)}** tokens`,
      `Output: **${formatTokens(output)}** tokens`,
      `Total: **${formatTokens(total)}** tokens`,
    ]
    if (pct !== null) lines.push(`Context: **${pct}%** of ${formatTokens(ctx)}`)
    if (session.model) lines.push(`Model: \`${session.model}\``)
    return { content: lines.join('\n') }
  } catch (e) {
    return { content: `Failed: ${e}` }
  }
}

async function execAgents(client: GatewayClient): Promise<SlashResult> {
  try {
    const r = await client.request<AgentsListResult>('agents.list', {})
    const agents = r?.agents ?? []
    if (agents.length === 0) return { content: 'No agents configured.' }
    const lines = [`**Agents** (${agents.length})\n`]
    for (const a of agents) {
      const name = a.identity?.name || a.name || a.id
      const def = a.id === r?.defaultId ? ' *(default)*' : ''
      lines.push(`- \`${a.id}\` — ${name}${def}`)
    }
    return { content: lines.join('\n') }
  } catch (e) {
    return { content: `Failed: ${e}` }
  }
}

async function execKill(client: GatewayClient, sk: string, args: string): Promise<SlashResult> {
  const target = args.trim()
  if (!target) return { content: 'Usage: `/kill <id|all>`' }
  try {
    const r = await client.request<SessionsListResult>('sessions.list', {})
    const sessions = r?.sessions ?? []
    const isAll = target.toLowerCase() === 'all'

    const agentId = /^agent:([^:]+)/.exec(sk)?.[1]
    const matches = sessions.filter((s) => {
      if (!s.key.includes(':subagent:')) return false
      const sAgent = /^agent:([^:]+)/.exec(s.key)?.[1]
      if (sAgent !== agentId) return false
      if (isAll) return true
      return s.key === target || s.key.endsWith(`:subagent:${target}`) || s.key.includes(target)
    })

    if (matches.length === 0) return { content: isAll ? 'No sub-agent sessions found.' : `No match for \`${target}\`.` }

    const results = await Promise.allSettled(matches.map((s) => client.request('chat.abort', { sessionKey: s.key })))
    const ok = results.filter((r) => r.status === 'fulfilled').length
    if (ok === 0) return { content: 'No active runs to abort.' }
    const plural = ok === 1 ? '' : 's'
    return { content: `Aborted ${ok} sub-agent session${plural}.` }
  } catch (e) {
    return { content: `Failed: ${e}` }
  }
}
