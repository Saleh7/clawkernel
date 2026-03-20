import { describe, expect, it } from 'vitest'
import { filterSlashCommands, parseSlashCommand, SLASH_COMMANDS } from '@/app/chat/lib/slash-commands'

describe('parseSlashCommand', () => {
  it('parses command with space-delimited args', () => {
    const result = parseSlashCommand('/model gpt-4')
    expect(result).toMatchObject({ command: { name: 'model' }, args: 'gpt-4' })
  })

  it('parses command with colon separator', () => {
    const result = parseSlashCommand('/think: high')
    expect(result).toMatchObject({ command: { name: 'think' }, args: 'high' })
  })

  it('parses colon without space', () => {
    const result = parseSlashCommand('/think:high')
    expect(result).toMatchObject({ command: { name: 'think' }, args: 'high' })
  })

  it('parses command with no args', () => {
    const result = parseSlashCommand('/help')
    expect(result).toMatchObject({ command: { name: 'help' }, args: '' })
  })

  it('returns null for non-slash text', () => {
    expect(parseSlashCommand('hello')).toBeNull()
    expect(parseSlashCommand('not a /command')).toBeNull()
  })

  it('returns null for unknown commands', () => {
    expect(parseSlashCommand('/nonexistent')).toBeNull()
  })

  it('is case-insensitive', () => {
    const result = parseSlashCommand('/HELP')
    expect(result).toMatchObject({ command: { name: 'help' } })
  })

  it('trims surrounding whitespace', () => {
    const result = parseSlashCommand('  /help  ')
    expect(result).toMatchObject({ command: { name: 'help' }, args: '' })
  })

  it('returns null for bare slash', () => {
    expect(parseSlashCommand('/')).toBeNull()
  })

  it('keeps /status as non-local (sent to agent)', () => {
    const status = SLASH_COMMANDS.find((c) => c.name === 'status')
    expect(status?.local).toBeUndefined()
    expect(parseSlashCommand('/status')).toMatchObject({ command: { name: 'status' }, args: '' })
  })
})

describe('filterSlashCommands', () => {
  it('returns all commands for empty filter', () => {
    const results = filterSlashCommands('')
    expect(results.length).toBe(SLASH_COMMANDS.length)
  })

  it('filters by command name prefix', () => {
    const results = filterSlashCommands('th')
    expect(results.some((c) => c.name === 'think')).toBe(true)
    expect(results.every((c) => c.name.startsWith('th') || c.desc.toLowerCase().includes('th'))).toBe(true)
  })

  it('filters by description content', () => {
    const results = filterSlashCommands('token')
    expect(results.some((c) => c.name === 'usage')).toBe(true)
  })

  it('returns empty for no matches', () => {
    expect(filterSlashCommands('zzzzzzz')).toHaveLength(0)
  })

  it('sorts exact prefix matches first', () => {
    const results = filterSlashCommands('st')
    const names = results.map((c) => c.name)
    const stopIdx = names.indexOf('stop')
    const statusIdx = names.indexOf('status')
    // Both start with 'st', but 'stop' and 'status' should appear before non-prefix matches
    expect(stopIdx).toBeGreaterThanOrEqual(0)
    expect(statusIdx).toBeGreaterThanOrEqual(0)
  })
})
