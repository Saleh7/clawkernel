// ---------------------------------------------------------------------------
//  Chat Page — thin orchestrator, all logic in use-chat hook
// ---------------------------------------------------------------------------

import { ChevronLeft, OctagonX, Paperclip, Plus, RefreshCw, RotateCcw, Send, Settings2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { sessionLabel } from '@/app/sessions/utils'
import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  ChatContainerContent,
  ChatContainerRoot,
  ChatContainerScrollAnchor,
} from '@/components/prompt-kit/chat-container'
import { TextShimmerLoader } from '@/components/prompt-kit/loader'
import {
  PromptInput,
  PromptInputAction,
  PromptInputActions,
  PromptInputTextarea,
} from '@/components/prompt-kit/prompt-input'
import { ScrollButton } from '@/components/prompt-kit/scroll-button'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { createLogger } from '@/lib/logger'
import { detectTextDirection } from '@/lib/text-direction'
import { cn } from '@/lib/utils'
import { useGatewayStore } from '@/stores/gateway-store'
import { AttachmentStrip } from './components/attachments'
import { ChatBubble } from './components/bubble'
import { SessionSidebar } from './components/session-sidebar'
import { SourcesPanel } from './components/sources-panel'
import {
  CompactionIndicator,
  ConnectionBanner,
  ContextMeter,
  EmptyState,
  FallbackIndicator,
  ImageLightbox,
  ProcessingIndicator,
  StreamingBubble,
} from './components/status-indicators'
import { ToolGroup } from './components/tool-group'
import { useChat } from './hooks/use-chat'
import type { AttachmentFile, Source } from './types'
import { ALL_ACCEPT } from './types'

const log = createLogger('chat:page')

type EscapeContext = {
  readonly lightboxSrc: string | null
  readonly sourcesPanel: Source[] | null
  readonly attachments: ReadonlyArray<Pick<AttachmentFile, 'id' | 'preview'>>
  readonly setLightboxSrc: (src: string | null) => void
  readonly setSourcesPanel: (panel: Source[] | null) => void
  readonly removeAttachment: (id: string) => void
}

async function execSessionReset(
  sessionKey: string,
  reason: 'new' | 'reset',
  onSuccess: () => void,
  setResetting: (v: boolean) => void,
): Promise<void> {
  const cl = useGatewayStore.getState().client
  if (!cl) return
  setResetting(true)
  try {
    await cl.request('sessions.reset', { key: sessionKey, reason })
    onSuccess()
  } catch (err) {
    log.error('Session reset failed', err)
  } finally {
    setResetting(false)
  }
}

function handleEscapeKey(ctx: EscapeContext): void {
  if (ctx.lightboxSrc) {
    ctx.setLightboxSrc(null)
    return
  }
  if (ctx.sourcesPanel) {
    ctx.setSourcesPanel(null)
    return
  }
  if (ctx.attachments.length > 0) {
    for (const a of ctx.attachments) {
      if (a.preview) URL.revokeObjectURL(a.preview)
    }
    for (const a of ctx.attachments) ctx.removeAttachment(a.id)
  }
}

function chatInputPlaceholder(connected: boolean, hasAttachments: boolean): string {
  if (!connected) return 'Connecting to gateway…'
  if (hasAttachments) return 'Add a message or paste more images…'
  return 'Type a message… (paste images with Ctrl+V)'
}

export default function ChatPage() {
  const c = useChat()
  const [sessionResetting, setSessionResetting] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const compactionStatus = useGatewayStore((s) => s.compactionStatus)
  const fallbackStatus = useGatewayStore((s) => s.fallbackStatus)

  // -- Keyboard shortcuts ---------------------------------------------------
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleEscapeKey({
          lightboxSrc: c.lightboxSrc,
          sourcesPanel: c.sourcesPanel,
          attachments: c.attachments,
          setLightboxSrc: c.setLightboxSrc,
          setSourcesPanel: c.setSourcesPanel,
          removeAttachment: c.removeAttachment,
        })
      }
    }
    globalThis.addEventListener('keydown', handler)
    return () => globalThis.removeEventListener('keydown', handler)
  }, [c.lightboxSrc, c.sourcesPanel, c.attachments, c.setLightboxSrc, c.setSourcesPanel, c.removeAttachment])

  const handleNewSession = () => void execSessionReset(c.selectedSession!, 'new', c.handleRefresh, setSessionResetting)

  const handleResetSession = () => {
    if (!c.selectedSession) return
    void execSessionReset(c.selectedSession, 'reset', c.handleRefresh, setSessionResetting)
  }

  let messageArea: React.ReactNode
  if (!c.selectedSession) {
    messageArea = <EmptyState hasSession={false} />
  } else if (c.chat.loading) {
    const loadingRows = Array.from({ length: 5 }, (_unused, n) => ({
      id: `chat-loading-${n + 1}`,
      reverse: n % 2 === 1,
    }))

    messageArea = (
      <div className="flex-1 p-4 space-y-4">
        {loadingRows.map((row) => (
          <div key={row.id} className={cn('flex gap-3 px-4', row.reverse && 'flex-row-reverse')}>
            <Skeleton className="h-8 w-8 rounded-full shrink-0" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
        ))}
      </div>
    )
  } else if (c.displayMessages.length === 0 && !c.isStreaming) {
    messageArea = <EmptyState hasSession />
  } else {
    messageArea = (
      <ChatContainerRoot className="flex-1 relative">
        <ChatContainerContent className="py-4 gap-1">
          {c.chat.hasMore && (
            <div className="flex justify-center py-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground"
                disabled={c.chat.loadingMore}
                onClick={c.handleLoadMore}
              >
                {c.chat.loadingMore ? (
                  <>
                    <RefreshCw className="h-3 w-3 mr-1.5 animate-spin" />
                    Loading…
                  </>
                ) : (
                  'Load earlier messages'
                )}
              </Button>
            </div>
          )}
          {c.renderItems.map((item) => {
            if (item.kind === 'divider') {
              return (
                <div key={`div-${item.timestamp ?? item.label}`} className="flex items-center gap-3 px-6 py-3">
                  <div className="flex-1 border-t border-dashed border-primary/25" />
                  <span className="text-[11px] font-medium text-primary/60 select-none">{item.label}</span>
                  <div className="flex-1 border-t border-dashed border-primary/25" />
                </div>
              )
            }
            if (item.kind === 'toolGroup') {
              return (
                <ToolGroup
                  key={`tg-${item.indices[0]}`}
                  messages={item.messages}
                  agentInfo={c.currentAgentInfo}
                  toolResults={c.toolResultsMap}
                  settings={c.settings}
                />
              )
            }
            const { msg, index: i } = item
            return (
              <ChatBubble
                key={`${msg.timestamp || i}-${i}`}
                message={msg}
                agentInfo={c.currentAgentInfo}
                toolResults={c.toolResultsMap}
                settings={c.settings}
                isLastAssistant={i === c.lastAssistantIndex}
                sources={c.sourcesMap.get(i)}
                onOpenSources={c.setSourcesPanel}
                onImageClick={c.setLightboxSrc}
                hideToolCalls={c.indicesInToolGroups.has(i)}
                onRetry={
                  msg.role === 'assistant'
                    ? () => {
                        const userMsg = c.displayMessages
                          .slice(0, i)
                          .reverse()
                          .find((m) => m.role === 'user')
                        if (userMsg) c.handleRetry(userMsg)
                      }
                    : undefined
                }
              />
            )
          })}
          {c.isStreaming && <StreamingBubble text={c.chat.streaming || null} agentInfo={c.currentAgentInfo} />}
          {!c.isStreaming && c.chat.sending && <ProcessingIndicator agentInfo={c.currentAgentInfo} />}
          <ChatContainerScrollAnchor />
        </ChatContainerContent>
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2">
          <ScrollButton />
        </div>
      </ChatContainerRoot>
    )
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* Hidden file input */}
      <input
        ref={c.fileInputRef}
        type="file"
        accept={ALL_ACCEPT}
        multiple
        onChange={c.handleFileSelect}
        className="hidden"
      />

      {/* Sidebar */}
      {c.sidebarOpen && (
        <SessionSidebar
          sessions={c.sessionEntries}
          agents={c.agentInfoMap}
          selected={c.selectedSession}
          onSelect={c.setSelectedSession}
          search={c.sidebarSearch}
          onSearchChange={c.setSidebarSearch}
          activeSessions={c.activeSessions}
        />
      )}

      {/* Main area with drag & drop */}
      <section
        aria-label="Chat area"
        className="flex flex-1 flex-col min-w-0 overflow-hidden relative"
        onDragEnter={c.handleDragEnter}
        onDragLeave={c.handleDragLeave}
        onDragOver={c.handleDragOver}
        onDrop={c.handleDrop}
      >
        {/* Drag overlay */}
        {c.dragging && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm border-2 border-dashed border-primary rounded-xl m-2 pointer-events-none">
            <div className="text-center space-y-2">
              <Paperclip className="h-10 w-10 text-primary mx-auto" />
              <p className="text-sm font-medium text-foreground">Drop files here</p>
              <p className="text-xs text-muted-foreground">Images, PDF, JSON, TXT, MD, CSV</p>
            </div>
          </div>
        )}

        <ConnectionBanner state={c.connectionState} error={c.chat.error} />
        {compactionStatus?.sessionKey === c.selectedSession && <CompactionIndicator active={compactionStatus.active} />}
        {fallbackStatus?.sessionKey === c.selectedSession && <FallbackIndicator status={fallbackStatus} />}

        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-2.5 bg-background/80 backdrop-blur-sm">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => c.setSidebarOpen(!c.sidebarOpen)}
                >
                  <ChevronLeft className={cn('h-4 w-4 transition-transform', !c.sidebarOpen && 'rotate-180')} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{c.sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {c.selectedSession && (
            <>
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-lg">{c.currentAgentInfo?.emoji || '🤖'}</span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-foreground truncate">
                    {c.currentAgentInfo?.name || c.currentAgentId || 'Agent'}
                  </div>
                  <div className="text-[10px] font-mono text-muted-foreground truncate">
                    {sessionLabel(c.selectedSession)}
                  </div>
                </div>
              </div>

              <div className="ml-auto flex items-center gap-2">
                {c.isStreaming && (
                  <>
                    <TextShimmerLoader text="Generating…" size="sm" />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-destructive hover:text-destructive"
                      onClick={c.handleAbort}
                    >
                      <OctagonX className="h-3.5 w-3.5 mr-1" />
                      Stop
                    </Button>
                  </>
                )}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        disabled={sessionResetting || !c.connected}
                        onClick={handleNewSession}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        New
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">New session (keeps history)</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs gap-1 text-destructive hover:text-destructive"
                        disabled={sessionResetting || !c.connected}
                        onClick={() => setShowResetConfirm(true)}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Reset
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Reset session (clears history)</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        disabled={c.chat.loading || !c.connected}
                        onClick={c.handleRefresh}
                      >
                        <RefreshCw className={cn('h-3.5 w-3.5', c.chat.loading && 'animate-spin')} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Refresh chat</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <ContextMeter used={c.currentSession?.totalTokens} max={c.currentSession?.contextTokens} />

                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <Settings2 className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-56 p-0">
                    <div className="px-4 py-3 border-b border-border">
                      <span className="text-xs font-semibold text-foreground">Chat display</span>
                    </div>
                    <div className="p-3 space-y-3">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="show-tools" className="text-xs text-muted-foreground cursor-pointer">
                          Show tool calls
                        </Label>
                        <Switch
                          id="show-tools"
                          checked={c.settings.showToolCalls}
                          onCheckedChange={(v) => c.setSettings((s) => ({ ...s, showToolCalls: v }))}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="show-thinking" className="text-xs text-muted-foreground cursor-pointer">
                          Show reasoning
                        </Label>
                        <Switch
                          id="show-thinking"
                          checked={c.settings.showThinking}
                          onCheckedChange={(v) => c.setSettings((s) => ({ ...s, showThinking: v }))}
                        />
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </>
          )}
        </div>

        {/* Messages */}
        {messageArea}

        {/* Error */}
        {c.chat.error && (
          <div className="mx-4 mb-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive">
            {c.chat.error}
          </div>
        )}

        {/* Queue indicator */}
        {c.queue.length > 0 && (
          <div className="mx-4 mb-0 flex items-center gap-2 rounded-t-lg bg-muted/50 border border-b-0 border-border px-3 py-1.5">
            <span className="text-xs text-muted-foreground">Queued ({c.queue.length})</span>
            {c.queue.map((item) => (
              <span
                key={item.id}
                className="inline-flex items-center gap-1 text-xs bg-background rounded px-1.5 py-0.5 border border-border"
              >
                <span className="truncate max-w-[120px]">{item.message || 'Image'}</span>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => c.removeQueueItem(item.id)}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Input */}
        {c.selectedSession && (
          <div className="border-t border-border p-4 bg-background">
            <PromptInput
              value={c.inputValue}
              onValueChange={c.setInputValue}
              onSubmit={c.handleSend}
              isLoading={c.chat.sending}
              disabled={!c.connected}
              className="max-w-3xl mx-auto"
            >
              <AttachmentStrip attachments={c.attachments} onRemove={c.removeAttachment} />
              <PromptInputTextarea
                placeholder={chatInputPlaceholder(c.connected, c.attachments.length > 0)}
                className="text-sm"
                dir={detectTextDirection(c.inputValue)}
                onPaste={c.handlePaste}
              />
              <PromptInputActions className="justify-between px-2 pb-1">
                <div className="flex items-center gap-1">
                  <PromptInputAction tooltip="Attach file">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-full"
                      onClick={() => c.fileInputRef.current?.click()}
                      disabled={!c.connected}
                    >
                      <Paperclip className="h-4 w-4" />
                    </Button>
                  </PromptInputAction>
                </div>

                <PromptInputAction tooltip={c.isStreaming ? 'Queue message (agent is working)' : 'Send message'}>
                  <Button
                    size="icon"
                    className="h-8 w-8 rounded-full"
                    onClick={c.handleSend}
                    disabled={
                      (!c.inputValue.trim() &&
                        c.attachments.filter((a) => !a.error && (a.base64 || a.textContent)).length === 0) ||
                      !c.connected
                    }
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </PromptInputAction>
                {c.isStreaming && (
                  <PromptInputAction tooltip="Stop generating">
                    <Button variant="destructive" size="icon" className="h-8 w-8 rounded-full" onClick={c.handleAbort}>
                      <OctagonX className="h-4 w-4" />
                    </Button>
                  </PromptInputAction>
                )}
              </PromptInputActions>
            </PromptInput>
          </div>
        )}
      </section>

      {/* Sources panel */}
      <SourcesPanel
        sources={c.sourcesPanel || []}
        open={c.sourcesPanel !== null}
        onClose={() => c.setSourcesPanel(null)}
      />

      {/* Lightbox */}
      {c.lightboxSrc && <ImageLightbox src={c.lightboxSrc} onClose={() => c.setLightboxSrc(null)} />}

      {/* Reset confirmation dialog */}
      <ConfirmDialog
        open={showResetConfirm}
        onOpenChange={setShowResetConfirm}
        title="Reset Session"
        description="This will clear all messages and reset the session state. This action cannot be undone."
        actionLabel="Reset"
        loading={sessionResetting}
        loadingLabel="Resetting…"
        onConfirm={handleResetSession}
      />
    </div>
  )
}
