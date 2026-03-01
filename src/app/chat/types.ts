// ---------------------------------------------------------------------------
//  Chat — Shared types & constants
// ---------------------------------------------------------------------------

import type { GatewaySessionRow } from '@/lib/gateway/types'

// -- Types ------------------------------------------------------------------

export type SessionEntry = GatewaySessionRow & { agentId: string; label: string; preview?: string }

export type ChatState = {
  messages: import('@/lib/gateway/types').ChatMessage[]
  loading: boolean
  loadingMore: boolean
  sending: boolean
  streaming: string | null
  runId: string | null
  thinkingLevel: string | null
  error: string | null
  hasMore: boolean
}

export type ChatSettings = {
  showToolCalls: boolean
  showThinking: boolean
}

export type AttachmentFile = {
  id: string
  file: File
  preview: string | null
  base64: string | null
  textContent: string | null
  mimeType: string
  kind: 'image' | 'file'
  error?: string
  truncated?: boolean
}

export type Source = {
  url: string
  title: string
  domain: string
  favicon: string
  snippet?: string
}

export type FileAttachment = {
  name: string
  mime: string
  content: string
}

export type ChatQueueItem = {
  id: string
  message: string
  attachments: Array<{ type: 'image'; mimeType: string; content: string }>
  contentBlocks: import('@/lib/gateway/types').ChatMessageContent[]
}

export type AgentInfo = { name: string; emoji?: string }

export type RenderItem =
  | { kind: 'message'; msg: import('@/lib/gateway/types').ChatMessage; index: number }
  | { kind: 'toolGroup'; messages: import('@/lib/gateway/types').ChatMessage[]; indices: number[] }
  | { kind: 'divider'; label: string; timestamp?: number }

// -- Constants --------------------------------------------------------------

export const MAX_IMAGE_DIM = 1280
export const IMAGE_QUALITY = 0.75
export const TARGET_SIZE = 300 * 1024
export const MAX_TEXT_CHARS = 200_000

export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
export const FILE_TYPES = ['application/pdf', 'application/json', 'text/plain', 'text/markdown', 'text/csv']
export const TEXT_READABLE_TYPES = new Set(['text/plain', 'text/markdown', 'text/csv', 'application/json'])
export const ALL_ACCEPT = '.png,.jpg,.jpeg,.gif,.webp,.pdf,.json,.txt,.md,.csv'

export const FILE_ICONS: Record<string, string> = {
  'application/pdf': '📄',
  'application/json': '📋',
  'text/plain': '📝',
  'text/markdown': '📝',
  'text/csv': '📊',
}
