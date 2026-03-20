import { Bookmark, ChevronDown, ChevronRight, X } from 'lucide-react'
import { useState } from 'react'
import type { ChatMessage } from '@/lib/gateway/types'
import type { PinnedMessages } from '../lib/pinned-messages'
import { extractText, messageKey } from '../utils'

export function PinnedBar({
  pinned,
  messages,
  onUpdate,
}: {
  readonly pinned: PinnedMessages
  readonly messages: ChatMessage[]
  readonly onUpdate: () => void
}) {
  const [expanded, setExpanded] = useState(false)

  const keyToMessage = new Map<string, { role: string; text: string }>()
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    const key = messageKey(msg, i)
    if (pinned.has(key)) {
      const text = extractText(msg)
      keyToMessage.set(key, { role: msg.role ?? 'unknown', text: text?.slice(0, 100) ?? '' })
    }
  }

  if (keyToMessage.size === 0) return null

  return (
    <div className="border-b border-border bg-muted/30">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-4 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <Bookmark className="h-3 w-3" />
        <span>{keyToMessage.size} pinned</span>
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </button>
      {expanded && (
        <div className="px-4 pb-2 space-y-1">
          {[...keyToMessage.entries()].map(([key, { role, text }]) => (
            <div key={key} className="flex items-center gap-2 text-xs">
              <span className="font-medium text-muted-foreground w-14 shrink-0">
                {role === 'user' ? 'You' : 'Agent'}
              </span>
              <span className="truncate text-foreground/70">
                {text}
                {text.length >= 100 ? '…' : ''}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  pinned.toggle(key)
                  onUpdate()
                }}
                className="ml-auto shrink-0 text-muted-foreground hover:text-foreground"
                title="Unpin"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
