import {
  ChevronLeft,
  Download,
  Mic,
  MicOff,
  OctagonX,
  Paperclip,
  PinOff,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings2,
  Slash,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
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
import { ModelSelector } from './components/model-selector'
import { PinnedBar } from './components/pinned-bar'
import { SearchBar } from './components/search-bar'
import { SessionSidebar } from './components/session-sidebar'
import { SlashMenu } from './components/slash-menu'
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
import { ToolSidebar } from './components/tool-sidebar'
import { WelcomeState } from './components/welcome-state'
import { useChat } from './hooks/use-chat'
import { exportChatMarkdown } from './lib/chat-export'
import { isSttActive, isSttSupported, startStt, stopStt } from './lib/speech'
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

const LOADING_ROWS = Array.from({ length: 5 }, (_unused, n) => ({
  id: `chat-loading-${n + 1}`,
  reverse: n % 2 === 1,
}))

function buildMessageArea(
  c: ReturnType<typeof useChat>,
  scrollLocked: boolean,
  setScrollLocked: (v: boolean) => void,
): React.ReactNode {
  if (!c.selectedSession) return <EmptyState hasSession={false} />

  if (c.chat.loading) {
    return (
      <div className="flex-1 p-4 space-y-4">
        {LOADING_ROWS.map((row) => (
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
  }

  if (c.displayMessages.length === 0 && !c.isStreaming && !c.searchQuery) {
    return (
      <WelcomeState
        agentInfo={c.currentAgentInfo}
        onSend={(text) => {
          c.setInputValue(text)
          setTimeout(() => c.handleSend(), 0)
        }}
      />
    )
  }

  return (
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
              contextWindow={c.currentSession?.contextTokens}
              isPinned={c.pinned?.has(c.displayKeys[i]) ?? false}
              onPin={() => {
                c.pinned?.toggle(c.displayKeys[i])
                c.triggerUpdate()
              }}
              onDelete={() => {
                c.deleted?.delete(c.displayKeys[i])
                c.triggerUpdate()
              }}
              onOpenToolOutput={c.setToolSidebarContent}
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
        {!scrollLocked && <ChatContainerScrollAnchor />}
      </ChatContainerContent>
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
        {scrollLocked && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-full text-xs gap-1.5 bg-background/80 backdrop-blur-sm"
            onClick={() => setScrollLocked(false)}
          >
            <PinOff className="h-3.5 w-3.5" />
            Auto-scroll paused
          </Button>
        )}
        {!scrollLocked && <ScrollButton />}
      </div>
    </ChatContainerRoot>
  )
}

export default function ChatPage() {
  const c = useChat()
  const [sessionResetting, setSessionResetting] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [scrollLocked, setScrollLocked] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const compactionStatus = useGatewayStore((s) => s.compactionStatus)
  const fallbackStatus = useGatewayStore((s) => s.fallbackStatus)
  const [sttRecording, setSttRecording] = useState(false)

  const setInputValue = c.setInputValue
  const toggleStt = useCallback(() => {
    if (isSttActive()) {
      stopStt()
      setSttRecording(false)
      return
    }
    const ok = startStt({
      onTranscript: (text, isFinal) => {
        if (isFinal) setInputValue((prev) => (prev ? `${prev} ${text}` : text))
      },
      onStart: () => setSttRecording(true),
      onEnd: () => setSttRecording(false),
      onError: () => setSttRecording(false),
    })
    if (!ok) setSttRecording(false)
  }, [setInputValue])

  const handleSearchToggle = useCallback(() => {
    c.setSearchOpen((v) => {
      if (v) c.setSearchQuery('')
      return !v
    })
  }, [c.setSearchOpen, c.setSearchQuery])

  const handleSearchClose = useCallback(() => {
    c.setSearchOpen(false)
    c.setSearchQuery('')
  }, [c.setSearchOpen, c.setSearchQuery])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === 'f') {
        e.preventDefault()
        handleSearchToggle()
        return
      }
      if (e.key === 'Escape') {
        if (c.searchOpen) {
          handleSearchClose()
          return
        }
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
  }, [
    c.lightboxSrc,
    c.sourcesPanel,
    c.attachments,
    c.setLightboxSrc,
    c.setSourcesPanel,
    c.removeAttachment,
    c.searchOpen,
    handleSearchToggle,
    handleSearchClose,
  ])

  const handleNewSession = () => {
    if (!c.selectedSession) return
    void execSessionReset(c.selectedSession, 'new', c.handleRefresh, setSessionResetting)
  }

  const handleRenameSubmit = useCallback(async () => {
    const cl = useGatewayStore.getState().client
    if (!cl || !c.selectedSession || !renameValue.trim()) {
      setRenaming(false)
      return
    }
    try {
      await cl.request('sessions.patch', { key: c.selectedSession, label: renameValue.trim() })
      c.handleRefresh()
    } catch (err) {
      log.warn('Session rename failed', err)
    }
    setRenaming(false)
  }, [c.selectedSession, c.handleRefresh, renameValue])

  const handleResetSession = () => {
    if (!c.selectedSession) return
    void execSessionReset(c.selectedSession, 'reset', c.handleRefresh, setSessionResetting)
  }

  const slashMenuState = c.slashMenu.state
  const {
    close: slashClose,
    update: slashUpdate,
    getActive: slashGetActive,
    moveUp: slashMoveUp,
    moveDown: slashMoveDown,
  } = c.slashMenu

  const handleSlashTab = useCallback(() => {
    const active = slashGetActive()
    if (typeof active === 'string') {
      c.setInputValue(`/${slashMenuState.argCommand?.name ?? ''} ${active}`)
      slashClose()
      return
    }
    if (!active) return
    const fill = active.args ? `/${active.name} ` : `/${active.name}`
    c.setInputValue(fill)
    if (active.argOptions?.length) slashUpdate(fill)
    else slashClose()
  }, [slashGetActive, slashClose, slashUpdate, c.setInputValue, slashMenuState.argCommand])

  const handleSlashKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
      const slashKeys: Record<string, () => void> = {
        ArrowUp: slashMoveUp,
        ArrowDown: slashMoveDown,
        Escape: slashClose,
        Tab: handleSlashTab,
      }
      const action = slashKeys[e.key]
      if (!action) return false
      e.preventDefault()
      action()
      return true
    },
    [slashMoveUp, slashMoveDown, slashClose, handleSlashTab],
  )

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (slashMenuState.open && handleSlashKeyDown(e)) return
      if (e.key === 'ArrowUp' && !e.shiftKey && !c.inputValue.includes('\n')) {
        const prev = c.inputHistory.up()
        if (prev !== null) {
          e.preventDefault()
          c.setInputValue(prev)
        }
        return
      }
      if (e.key === 'ArrowDown' && !e.shiftKey && !c.inputValue.includes('\n')) {
        e.preventDefault()
        c.setInputValue(c.inputHistory.down() ?? '')
      }
    },
    [slashMenuState.open, handleSlashKeyDown, c.inputHistory, c.inputValue, c.setInputValue],
  )

  const handleInputChange = useCallback(
    (v: string) => {
      c.setInputValue(v)
      slashUpdate(v)
    },
    [c.setInputValue, slashUpdate],
  )

  const handleSlashSelect = useCallback(
    (item: string | { name: string; args?: string; local?: boolean; argOptions?: string[] }) => {
      if (typeof item === 'string') {
        c.setInputValue(`/${slashMenuState.argCommand?.name ?? ''} ${item}`)
        slashClose()
        c.handleSend()
        return
      }
      const fill = `/${item.name} `
      if (item.argOptions?.length) {
        c.setInputValue(fill)
        slashUpdate(fill)
        return
      }
      if (item.local && !item.args) {
        c.setInputValue(`/${item.name}`)
        slashClose()
        setTimeout(() => c.handleSend(), 0)
        return
      }
      c.setInputValue(fill)
      slashClose()
    },
    [c.setInputValue, slashClose, slashUpdate, c.handleSend, slashMenuState.argCommand],
  )

  const messageArea = buildMessageArea(c, scrollLocked, setScrollLocked)

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
      <input
        ref={c.fileInputRef}
        type="file"
        accept={ALL_ACCEPT}
        multiple
        onChange={c.handleFileSelect}
        className="hidden"
      />
      {c.sidebarOpen && !c.focusMode && (
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
      <section
        aria-label="Chat area"
        className="flex flex-1 flex-col min-w-0 overflow-hidden relative"
        onDragEnter={c.handleDragEnter}
        onDragLeave={c.handleDragLeave}
        onDragOver={c.handleDragOver}
        onDrop={c.handleDrop}
      >
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
        {c.searchOpen && (
          <SearchBar
            query={c.searchQuery}
            onChange={c.setSearchQuery}
            onClose={() => {
              c.setSearchOpen(false)
              c.setSearchQuery('')
            }}
            matchCount={c.displayMessages.length}
          />
        )}
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
                  {renaming ? (
                    <input
                      type="text"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameSubmit()
                        if (e.key === 'Escape') setRenaming(false)
                      }}
                      onBlur={handleRenameSubmit}
                      className="text-[10px] font-mono text-foreground bg-transparent border-b border-primary outline-none w-full max-w-[200px]"
                    />
                  ) : (
                    <button
                      type="button"
                      className="text-[10px] font-mono text-muted-foreground truncate cursor-pointer hover:text-foreground transition-colors bg-transparent border-0 p-0 text-left"
                      onDoubleClick={() => {
                        setRenameValue(c.currentSession?.label || sessionLabel(c.selectedSession ?? ''))
                        setRenaming(true)
                      }}
                      title="Double-click to rename"
                    >
                      {c.currentSession?.label || sessionLabel(c.selectedSession)}
                    </button>
                  )}
                </div>
              </div>

              <div className="ml-auto flex items-center gap-2">
                {c.isStreaming && <TextShimmerLoader text="Generating…" size="sm" />}
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
                      <div className="flex items-center justify-between">
                        <Label htmlFor="focus-mode" className="text-xs text-muted-foreground cursor-pointer">
                          Focus mode
                        </Label>
                        <Switch id="focus-mode" checked={c.focusMode} onCheckedChange={c.setFocusMode} />
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </>
          )}
        </div>
        {c.pinned && c.selectedSession && (
          <PinnedBar pinned={c.pinned} messages={c.chat.messages} onUpdate={c.triggerUpdate} />
        )}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          <div className="flex flex-1 flex-col min-w-0">{messageArea}</div>
          <ToolSidebar
            content={c.toolSidebarContent}
            open={c.toolSidebarContent !== null}
            onClose={() => c.setToolSidebarContent(null)}
          />
        </div>
        {c.chat.error && (
          <div className="mx-4 mb-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive">
            {c.chat.error}
          </div>
        )}
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
        {c.selectedSession && (
          <div className="px-4 pb-3 pt-2 bg-gradient-to-b from-transparent to-background">
            <PromptInput
              value={c.inputValue}
              onValueChange={handleInputChange}
              onSubmit={c.handleSend}
              isLoading={c.chat.sending}
              disabled={!c.connected}
              className={cn(
                'relative',
                'border-border/60 bg-card shadow-sm',
                'transition-[border-color,box-shadow] duration-150',
                'focus-within:border-primary/40 focus-within:shadow-[0_0_0_2px_hsl(var(--primary)/0.08)]',
              )}
            >
              {slashMenuState.open && (
                <SlashMenu
                  items={slashMenuState.items}
                  activeIndex={slashMenuState.activeIndex}
                  mode={slashMenuState.mode}
                  argItems={slashMenuState.argItems}
                  argCommand={slashMenuState.argCommand}
                  onSelect={handleSlashSelect}
                  onHover={c.slashMenu.setHover}
                />
              )}
              <AttachmentStrip attachments={c.attachments} onRemove={c.removeAttachment} />
              <PromptInputTextarea
                placeholder={
                  sttRecording ? 'Listening…' : `Message ${c.currentAgentInfo?.name || 'Agent'} (Enter to send)`
                }
                className="text-sm min-h-[40px] px-3.5 py-3 pb-2"
                dir={detectTextDirection(c.inputValue)}
                onPaste={c.handlePaste}
                onKeyDown={handleInputKeyDown}
              />
              <PromptInputActions className="justify-between px-2.5 py-1.5 border-t border-border/40">
                <div className="flex items-center gap-0.5">
                  <PromptInputAction tooltip="Commands (/)">
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn(
                        'h-7 w-7 rounded-md',
                        slashMenuState.open
                          ? 'text-primary bg-primary/10'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                      onClick={() => {
                        if (slashMenuState.open) {
                          slashClose()
                          c.setInputValue('')
                        } else {
                          c.setInputValue('/')
                          slashUpdate('/')
                        }
                      }}
                      disabled={!c.connected}
                    >
                      <Slash className="h-4 w-4" />
                    </Button>
                  </PromptInputAction>
                  <PromptInputAction tooltip="Attach file">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground"
                      onClick={() => c.fileInputRef.current?.click()}
                      disabled={!c.connected}
                    >
                      <Paperclip className="h-4 w-4" />
                    </Button>
                  </PromptInputAction>
                  {isSttSupported() && (
                    <PromptInputAction tooltip={sttRecording ? 'Stop recording' : 'Voice input'}>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                          'h-7 w-7 rounded-md',
                          sttRecording
                            ? 'text-destructive bg-destructive/10'
                            : 'text-muted-foreground hover:text-foreground',
                        )}
                        onClick={toggleStt}
                        disabled={!c.connected}
                      >
                        {sttRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                      </Button>
                    </PromptInputAction>
                  )}
                  <ModelSelector
                    sessionKey={c.selectedSession}
                    currentModel={c.currentSession?.model}
                    defaultModel={null}
                    disabled={!c.connected || c.isStreaming}
                    onModelChange={c.handleRefresh}
                  />
                  {c.inputValue.length >= 100 && (
                    <span className="text-[10px] font-mono text-muted-foreground/50 ml-1">
                      ~{Math.ceil(c.inputValue.length / 4)} tokens
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-0.5">
                  <PromptInputAction tooltip="Search messages (Ctrl+F)">
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn(
                        'h-7 w-7 rounded-md',
                        c.searchOpen ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground',
                      )}
                      onClick={() => {
                        c.setSearchOpen((v) => !v)
                        if (c.searchOpen) c.setSearchQuery('')
                      }}
                    >
                      <Search className="h-4 w-4" />
                    </Button>
                  </PromptInputAction>
                  <PromptInputAction tooltip="Export chat">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground"
                      onClick={() =>
                        exportChatMarkdown(c.chat.messages, c.currentAgentInfo?.name || c.currentAgentId || 'Agent')
                      }
                      disabled={c.chat.messages.length === 0}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </PromptInputAction>
                  {!c.isStreaming && (
                    <PromptInputAction tooltip="New session">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground"
                        onClick={handleNewSession}
                        disabled={sessionResetting || !c.connected}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </PromptInputAction>
                  )}
                  {c.isStreaming && (
                    <PromptInputAction tooltip="Stop generating">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 rounded-md text-destructive hover:bg-destructive/10"
                        onClick={c.handleAbort}
                      >
                        <OctagonX className="h-4 w-4" />
                      </Button>
                    </PromptInputAction>
                  )}
                  <PromptInputAction tooltip={c.isStreaming ? 'Queue message' : 'Send message'}>
                    <button
                      type="button"
                      onClick={c.handleSend}
                      disabled={
                        (!c.inputValue.trim() &&
                          c.attachments.filter((a) => !a.error && (a.base64 || a.textContent)).length === 0) ||
                        !c.connected
                      }
                      className={cn(
                        'inline-flex items-center justify-center h-7 w-7 rounded-md',
                        'bg-primary text-primary-foreground',
                        'transition-[background,box-shadow] duration-150',
                        'hover:bg-primary/90 hover:shadow-[0_2px_8px_hsl(var(--primary)/0.25)]',
                        'disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:shadow-none',
                      )}
                    >
                      <Send className="h-3.5 w-3.5" />
                    </button>
                  </PromptInputAction>
                </div>
              </PromptInputActions>
            </PromptInput>
          </div>
        )}
      </section>
      <SourcesPanel
        sources={c.sourcesPanel || []}
        open={c.sourcesPanel !== null}
        onClose={() => c.setSourcesPanel(null)}
      />
      {c.lightboxSrc && <ImageLightbox src={c.lightboxSrc} onClose={() => c.setLightboxSrc(null)} />}
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
