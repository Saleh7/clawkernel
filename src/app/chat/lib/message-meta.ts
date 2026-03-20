// Per-message metadata extraction (tokens, cost, model)

import { formatTokens } from '@/lib/format'
import type { ChatMessage } from '@/lib/gateway/types'

export type MessageMeta = {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  cost: number
  model: string | null
  contextPct: number | null
}

export function extractMessageMeta(msg: ChatMessage, contextWindow?: number): MessageMeta | null {
  if (msg.role !== 'assistant') return null
  const m = msg as Record<string, unknown>
  const usage = m.usage as Record<string, number> | undefined
  const cost = m.cost as Record<string, number> | undefined
  const model = typeof m.model === 'string' && m.model !== 'gateway-injected' ? m.model : null

  if (!usage && !model) return null

  const input = usage?.input ?? usage?.inputTokens ?? 0
  const output = usage?.output ?? usage?.outputTokens ?? 0
  const cacheRead = usage?.cacheRead ?? usage?.cache_read_input_tokens ?? 0
  const cacheWrite = usage?.cacheWrite ?? usage?.cache_creation_input_tokens ?? 0
  const totalCost = cost?.total ?? 0
  const contextPct = contextWindow && input > 0 ? Math.min(Math.round((input / contextWindow) * 100), 100) : null

  return { input, output, cacheRead, cacheWrite, cost: totalCost, model, contextPct }
}

export function formatMeta(meta: MessageMeta): string[] {
  const parts: string[] = []
  if (meta.input) parts.push(`↑${formatTokens(meta.input)}`)
  if (meta.output) parts.push(`↓${formatTokens(meta.output)}`)
  if (meta.cacheRead) parts.push(`R${formatTokens(meta.cacheRead)}`)
  if (meta.cacheWrite) parts.push(`W${formatTokens(meta.cacheWrite)}`)
  if (meta.cost > 0) parts.push(`$${meta.cost.toFixed(4)}`)
  if (meta.contextPct !== null) parts.push(`${meta.contextPct}% ctx`)
  if (meta.model) {
    const short = meta.model.includes('/') ? meta.model.split('/').pop()! : meta.model
    parts.push(short)
  }
  return parts
}
