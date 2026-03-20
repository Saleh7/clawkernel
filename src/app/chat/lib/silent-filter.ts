// Filter NO_REPLY silent messages from display

import type { ChatMessage } from '@/lib/gateway/types'
import { extractText } from '../utils'

const SILENT_RE = /^\s*NO_REPLY\s*$/

export function isSilentReply(msg: ChatMessage): boolean {
  if (msg.role !== 'assistant') return false
  const text = extractText(msg)
  return typeof text === 'string' && SILENT_RE.test(text)
}
