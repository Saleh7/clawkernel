import { Bot, Check, ChevronRight, Copy, ImageOff, RotateCcw, Sparkles, User } from 'lucide-react'
import { memo, useCallback, useState } from 'react'
import { Markdown } from '@/components/prompt-kit/markdown'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { ChatMessage } from '@/lib/gateway/types'
import { cn } from '@/lib/utils'
import type { AgentInfo, ChatSettings, FileAttachment, Source } from '../types'
import { FILE_ICONS } from '../types'
import {
  extractFileAttachments,
  extractImages,
  extractText,
  extractThinking,
  extractToolCalls,
  fmtTimeFull,
  fmtTimeShort,
  getRawText,
} from '../utils'
import { SourcesButton } from './sources-panel'
import { ToolCallBlock } from './tool-group'

// ---------------------------------------------------------------------------
//  File Attachment Card (inline in chat bubbles)
// ---------------------------------------------------------------------------

function FileAttachmentCard({ file, align }: { readonly file: FileAttachment; readonly align: 'start' | 'end' }) {
  const ext = file.name.split('.').pop()?.toUpperCase() || ''
  const icon = FILE_ICONS[file.mime] || '📎'
  const displayName = file.name.replace(/---[a-f0-9-]{36}/, '')
  const charCount = file.content.length
  const label = charCount > 1000 ? `${(charCount / 1000).toFixed(0)}K chars` : `${charCount} chars`

  return (
    <div
      className={cn(
        'flex items-center gap-2.5 rounded-xl border border-border/60 bg-muted/30 px-3 py-2 max-w-[280px]',
        align === 'end' ? 'self-end' : 'self-start',
      )}
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted shrink-0 text-lg">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-foreground truncate">{displayName}</p>
        <p className="text-[10px] text-muted-foreground">
          {ext} · {label}
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
//  Message Actions Bar — appears on hover at the top-right of the bubble
// ---------------------------------------------------------------------------

function MessageActionsBar({ text, onRetry }: { readonly text: string; readonly onRetry?: () => void }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [text])

  return (
    <TooltipProvider>
      <div
        className={cn(
          'absolute -top-3 right-2 flex items-center gap-0.5',
          'rounded-md border border-border bg-background shadow-sm px-0.5 py-0.5',
          'opacity-0 group-hover/msg:opacity-100 group-focus-within/msg:opacity-100 transition-opacity duration-100',
        )}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCopy}>
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">{copied ? 'Copied!' : 'Copy'}</TooltipContent>
        </Tooltip>
        {onRetry && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onRetry}>
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Retry</TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  )
}

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

function resolveDisplayContent(
  message: ChatMessage,
  isUser: boolean,
): { text: string | null; thinking: string | null } {
  const text = extractText(message)
  const thinking = extractThinking(message)
  const toolCalls = extractToolCalls(message)
  // Fall back to thinking only when there's no text and no tool calls (rare reasoning-only response)
  if (!text?.trim() && thinking && !isUser && toolCalls.length === 0) {
    return { text: thinking, thinking: null }
  }
  return { text, thinking }
}

// ---------------------------------------------------------------------------
//  Chat Bubble (memoized)
// ---------------------------------------------------------------------------

export const ChatBubble = memo(
  function ChatBubble({
    message,
    agentInfo,
    toolResults,
    settings,
    isLastAssistant,
    sources,
    onOpenSources,
    onImageClick,
    hideToolCalls,
    onRetry,
  }: {
    message: ChatMessage
    agentInfo?: AgentInfo
    toolResults: Map<string, { content: string; isError: boolean; details?: Record<string, unknown> }>
    settings: ChatSettings
    isLastAssistant?: boolean
    sources?: Source[]
    onOpenSources?: (sources: Source[]) => void
    onImageClick?: (src: string) => void
    hideToolCalls?: boolean
    onRetry?: () => void
  }) {
    const isUser = message.role === 'user'
    const { text, thinking } = resolveDisplayContent(message, isUser)
    const rawText = getRawText(message)
    const fileAttachments = isUser && rawText ? extractFileAttachments(rawText) : []
    const toolCalls = extractToolCalls(message)
    const images = extractImages(message)
    const timestamp = message.timestamp
    const showTools = toolCalls.length > 0 && settings.showToolCalls && !hideToolCalls

    const hasVisibleContent =
      fileAttachments.length > 0 ||
      images.length > 0 ||
      (thinking && settings.showThinking) ||
      showTools ||
      text?.trim() ||
      (sources && sources.length > 0)

    if (!hasVisibleContent) return null

    return (
      <div className={cn('group/msg flex gap-3 px-4 py-2', isUser ? 'flex-row-reverse' : 'flex-row')}>
        <div
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm',
            isUser ? 'bg-primary text-primary-foreground' : 'bg-accent text-accent-foreground',
          )}
        >
          {isUser ? <User className="h-4 w-4" /> : agentInfo?.emoji || <Bot className="h-4 w-4" />}
        </div>

        <div className={cn('flex flex-col gap-1 max-w-[75%] min-w-0', isUser ? 'items-end' : 'items-start')}>
          {/* Images */}
          {images.length > 0 && (
            <div className={cn('flex flex-wrap gap-2 mb-1', isUser ? 'justify-end' : 'justify-start')}>
              {images.map((img, i) => {
                if (img.kind === 'omitted') {
                  const sizeKB = img.bytes > 0 ? `${Math.round(img.bytes / 1024)} KB` : ''
                  return (
                    <div
                      key={i}
                      className="flex flex-col items-center justify-center gap-1.5 w-[160px] h-[100px] rounded-xl border border-dashed border-border bg-muted/50 text-muted-foreground"
                    >
                      <ImageOff className="h-5 w-5" />
                      <span className="text-[11px] leading-tight text-center">
                        Image not stored{sizeKB ? ` (${sizeKB})` : ''}
                      </span>
                    </div>
                  )
                }
                const src = img.kind === 'url' ? img.url : `data:${img.mediaType};base64,${img.data}`
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => onImageClick?.(src)}
                    className="focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-xl"
                    aria-label={`View attachment ${i + 1}`}
                  >
                    <img
                      src={src}
                      alt={`Attachment ${i + 1}`}
                      loading="lazy"
                      className="max-w-[300px] max-h-[300px] rounded-xl object-cover border border-border hover:opacity-90 transition-opacity"
                    />
                  </button>
                )
              })}
            </div>
          )}

          {/* File attachments */}
          {fileAttachments.length > 0 && (
            <div className="flex flex-col gap-1.5 mb-1">
              {fileAttachments.map((f, i) => (
                <FileAttachmentCard key={`${f.name}-${i}`} file={f} align={isUser ? 'end' : 'start'} />
              ))}
            </div>
          )}

          {/* Thinking */}
          {thinking && settings.showThinking && (
            <Collapsible>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-1"
                >
                  <Sparkles className="h-3 w-3" />
                  <span>Reasoning</span>
                  <ChevronRight className="h-3 w-3" />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="rounded-xl border border-border/50 bg-card/30 px-3 py-2 text-xs text-muted-foreground mb-2 max-h-60 overflow-auto">
                  <Markdown className="text-xs opacity-80">{thinking}</Markdown>
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Tool calls */}
          {showTools && (
            <div className="space-y-1 w-full mb-1">
              {toolCalls.map((tc) => (
                <ToolCallBlock
                  key={tc.id || tc.name}
                  name={tc.name}
                  args={tc.arguments}
                  result={toolResults.get(tc.id)?.content}
                  isError={toolResults.get(tc.id)?.isError}
                />
              ))}
            </div>
          )}

          {/* Text — wrapped in relative container for action bar overlay */}
          {text?.trim() && (
            <div className="relative">
              <div
                className={cn(
                  'rounded-2xl px-4 py-2.5 text-sm leading-relaxed overflow-x-auto overflow-y-hidden',
                  isUser
                    ? 'bg-primary text-primary-foreground rounded-br-md'
                    : 'bg-card text-card-foreground border border-border rounded-bl-md',
                )}
              >
                <Markdown className={isUser ? 'user-markdown' : undefined}>{text}</Markdown>
              </div>
              <MessageActionsBar text={text} onRetry={!isUser ? onRetry : undefined} />
            </div>
          )}

          {/* Sources */}
          {sources && sources.length > 0 && onOpenSources && (
            <SourcesButton sources={sources} onClick={() => onOpenSources(sources)} />
          )}

          {/* Timestamp */}
          {timestamp && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger
                  className={cn(
                    'text-xs text-muted-foreground cursor-default transition-opacity duration-100',
                    'opacity-0 group-hover/msg:opacity-100',
                    isLastAssistant && 'opacity-100',
                  )}
                >
                  {fmtTimeShort(timestamp)}
                </TooltipTrigger>
                <TooltipContent side="top">{fmtTimeFull(timestamp)}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>
    )
  },
  (prev, next) => {
    if (prev.isLastAssistant !== next.isLastAssistant) return false
    if (prev.hideToolCalls !== next.hideToolCalls) return false
    if (prev.settings !== next.settings) return false
    if (prev.sources !== next.sources) return false
    if (prev.toolResults !== next.toolResults) return false
    // Compare content by reference first (fast path), then by extracted text
    if (prev.message.content !== next.message.content) {
      if (extractText(prev.message) !== extractText(next.message)) return false
      if (extractThinking(prev.message) !== extractThinking(next.message)) return false
    }
    return true
  },
)
