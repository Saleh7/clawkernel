// Export chat history as a downloadable Markdown file

import type { ChatMessage } from '@/lib/gateway/types'
import { extractText } from '../utils'

export function exportChatMarkdown(messages: ChatMessage[], assistantName: string) {
  const history = messages.filter((m) => m.role === 'user' || m.role === 'assistant')
  if (history.length === 0) return

  const lines = [`# Chat with ${assistantName}`, '']
  for (const msg of history) {
    const role = msg.role === 'user' ? 'You' : assistantName
    const text = extractText(msg) ?? ''
    const ts = msg.timestamp ? new Date(msg.timestamp).toISOString() : ''
    const heading = ts ? `## ${role} (${ts})` : `## ${role}`
    lines.push(heading, '', text, '')
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `chat-${assistantName}-${Date.now()}.md`
  a.click()
  URL.revokeObjectURL(url)
}
