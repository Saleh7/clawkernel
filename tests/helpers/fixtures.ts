// ---------------------------------------------------------------------------
//  Test fixtures — typed ChatMessage factory
// ---------------------------------------------------------------------------

import type { ChatMessage, ChatMessageContent } from '@/lib/gateway/types'

let seq = 0

/** Reset sequence counter between tests for isolation */
export function resetFixtureSeq() {
  seq = 0
}

type MsgOverrides = Partial<ChatMessage> & { content?: ChatMessageContent[] }

export function makeMsg(role: string, overrides: MsgOverrides = {}): ChatMessage {
  seq += 1
  return {
    role,
    timestamp: Date.now() + seq,
    content: [],
    ...overrides,
  }
}

export function textBlock(text: string): ChatMessageContent {
  return { type: 'text', text }
}

export function thinkingBlock(thinking: string): ChatMessageContent {
  return { type: 'thinking', thinking }
}

export function toolCallBlock(id: string, name: string, args: Record<string, unknown> = {}): ChatMessageContent {
  return { type: 'toolCall', id, name, arguments: args }
}

export function imageBlock(source?: unknown, url?: string): ChatMessageContent {
  const block: ChatMessageContent = { type: 'image' }
  if (source) (block as Record<string, unknown>).source = source
  if (url) (block as Record<string, unknown>).url = url
  return block
}

export function imageUrlBlock(url: string): ChatMessageContent {
  return { type: 'image_url', image_url: { url } }
}

export function omittedImageBlock(bytes: number, mimeType = 'image/png'): ChatMessageContent {
  const block: ChatMessageContent = { type: 'image' }
  const rec = block as Record<string, unknown>
  rec.omitted = true
  rec.bytes = bytes
  rec.mimeType = mimeType
  return block
}
