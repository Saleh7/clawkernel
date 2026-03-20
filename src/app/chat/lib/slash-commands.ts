// Slash command definitions & parser

export type SlashCategory = 'session' | 'model' | 'tools' | 'agents'

export type SlashCommandDef = {
  name: string
  desc: string
  args?: string
  icon?: string
  category: SlashCategory
  local?: boolean
  argOptions?: string[]
}

export const SLASH_COMMANDS: SlashCommandDef[] = [
  { name: 'new', desc: 'Start a new session', icon: '➕', category: 'session', local: true },
  { name: 'reset', desc: 'Reset current session', icon: '🔄', category: 'session', local: true },
  { name: 'compact', desc: 'Compact session context', icon: '📦', category: 'session', local: true },
  { name: 'stop', desc: 'Stop current run', icon: '⏹', category: 'session', local: true },
  { name: 'clear', desc: 'Clear chat display', icon: '🧹', category: 'session', local: true },

  { name: 'model', desc: 'Show or set model', args: '<name>', icon: '🧠', category: 'model', local: true },
  {
    name: 'think',
    desc: 'Set thinking level',
    args: '<level>',
    icon: '💭',
    category: 'model',
    local: true,
    argOptions: ['off', 'low', 'medium', 'high'],
  },
  {
    name: 'fast',
    desc: 'Toggle fast mode',
    args: '<on|off>',
    icon: '⚡',
    category: 'model',
    local: true,
    argOptions: ['status', 'on', 'off'],
  },
  {
    name: 'verbose',
    desc: 'Toggle verbose mode',
    args: '<on|off|full>',
    icon: '📝',
    category: 'model',
    local: true,
    argOptions: ['on', 'off', 'full'],
  },

  { name: 'help', desc: 'Show available commands', icon: '❓', category: 'tools', local: true },
  { name: 'status', desc: 'Show session status', icon: '📊', category: 'tools' },
  { name: 'export', desc: 'Export chat to Markdown', icon: '📥', category: 'tools', local: true },
  { name: 'usage', desc: 'Show token usage', icon: '📈', category: 'tools', local: true },

  { name: 'agents', desc: 'List agents', icon: '🤖', category: 'agents', local: true },
  { name: 'kill', desc: 'Abort sub-agents', args: '<id|all>', icon: '💀', category: 'agents', local: true },
  { name: 'skill', desc: 'Run a skill', args: '<name>', icon: '🎯', category: 'tools' },
  { name: 'steer', desc: 'Steer a sub-agent', args: '<id> <msg>', icon: '🎮', category: 'agents' },
]

const CATEGORY_ORDER: SlashCategory[] = ['session', 'model', 'tools', 'agents']

export const CATEGORY_LABELS: Record<SlashCategory, string> = {
  session: 'Session',
  model: 'Model',
  tools: 'Tools',
  agents: 'Agents',
}

export function filterSlashCommands(filter: string): SlashCommandDef[] {
  const q = filter.toLowerCase()
  const cmds = q
    ? SLASH_COMMANDS.filter((c) => c.name.startsWith(q) || c.desc.toLowerCase().includes(q))
    : SLASH_COMMANDS
  return [...cmds].sort((a: SlashCommandDef, b: SlashCommandDef) => {
    const ai = CATEGORY_ORDER.indexOf(a.category)
    const bi = CATEGORY_ORDER.indexOf(b.category)
    if (ai !== bi) return ai - bi
    if (q) {
      const ae = a.name.startsWith(q) ? 0 : 1
      const be = b.name.startsWith(q) ? 0 : 1
      if (ae !== be) return ae - be
    }
    return 0
  })
}

type ParsedSlashCommand = { command: SlashCommandDef; args: string }

export function parseSlashCommand(text: string): ParsedSlashCommand | null {
  const trimmed = text.trim()
  if (!trimmed.startsWith('/')) return null
  const body = trimmed.slice(1)
  const sep = body.search(/[\s:]/)
  const name = (sep === -1 ? body : body.slice(0, sep)).toLowerCase()
  if (!name) return null
  const command = SLASH_COMMANDS.find((c) => c.name === name)
  if (!command) return null
  let rest = sep === -1 ? '' : body.slice(sep).trimStart()
  if (rest.startsWith(':')) rest = rest.slice(1).trimStart()
  return { command, args: rest.trim() }
}
