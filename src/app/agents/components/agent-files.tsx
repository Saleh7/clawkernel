import { AlertTriangle, ChevronRight, File, FolderOpen, RefreshCw, RotateCcw, Save, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import type { GatewayClient } from '@/lib/gateway/client'
import type { AgentFileEntry } from '@/lib/gateway/types'
import { createLogger } from '@/lib/logger'
import { cn } from '@/lib/utils'

const log = createLogger('agents:files')

type FilesListResult = { agentId: string; workspace: string; files: AgentFileEntry[] }
type FileGetResult = { agentId: string; workspace: string; file: AgentFileEntry }

type Props = { readonly agentId: string; readonly client: GatewayClient | null }

function formatBytes(bytes?: number) {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  const u = ['KB', 'MB', 'GB']
  let s = bytes / 1024,
    i = 0
  while (s >= 1024 && i < u.length - 1) {
    s /= 1024
    i++
  }
  return `${s.toFixed(s < 10 ? 1 : 0)} ${u[i]}`
}

function getFileEmoji(name: string) {
  const ext = name.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'md':
      return '📝'
    case 'ts':
    case 'tsx':
    case 'js':
    case 'jsx':
      return '⚡'
    case 'json':
      return '📋'
    case 'txt':
      return '📄'
    case 'yaml':
    case 'yml':
      return '⚙️'
    default:
      return '📄'
  }
}

export function AgentFiles({ agentId, client }: Props) {
  const [files, setFiles] = useState<AgentFileEntry[]>([])
  const [workspace, setWorkspace] = useState('')
  const [loading, setLoading] = useState(false)
  const [openTabs, setOpenTabs] = useState<string[]>([])
  const [activeFile, setActiveFile] = useState<string | null>(null)
  const [contents, setContents] = useState<Record<string, string>>({})
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [loadingFile, setLoadingFile] = useState(false)

  const loadFiles = useCallback(async () => {
    if (!client) return
    setLoading(true)
    try {
      const r = await client.request<FilesListResult>('agents.files.list', { agentId })
      setFiles(r.files)
      setWorkspace(r.workspace)
    } catch (err) {
      log.warn('Files list failed', err)
    }
    setLoading(false)
  }, [client, agentId])

  useEffect(() => {
    setOpenTabs([])
    setActiveFile(null)
    setContents({})
    setDrafts({})
    void loadFiles()
  }, [loadFiles])

  const selectFile = async (name: string) => {
    if (!openTabs.includes(name)) {
      setOpenTabs((prev) => [...prev, name])
    }
    setActiveFile(name)
    if (contents[name] != null) return
    if (!client) return
    setLoadingFile(true)
    try {
      const r = await client.request<FileGetResult>('agents.files.get', { agentId, name })
      const c = r.file.content ?? ''
      setContents((p) => ({ ...p, [name]: c }))
      setDrafts((p) => ({ ...p, [name]: c }))
    } catch (err) {
      log.warn('File content load failed', err)
    }
    setLoadingFile(false)
  }

  const closeTab = (name: string) => {
    setOpenTabs((prev) => prev.filter((t) => t !== name))
    if (activeFile === name) {
      const remaining = openTabs.filter((t) => t !== name)
      setActiveFile(remaining.at(-1) ?? null)
    }
  }

  const saveFile = async () => {
    if (!client || !activeFile) return
    setSaving(true)

    const fileName = activeFile
    const nextContent = drafts[fileName] ?? ''

    try {
      await client.request('agents.files.set', { agentId, name: fileName, content: nextContent })
      setContents((prev) => ({ ...prev, [fileName]: nextContent }))
    } catch (error_) {
      log.warn('Failed to save file', error_)
      toast.error('Failed to save file')
    }

    setSaving(false)
  }

  const resetDraft = () => {
    if (!activeFile) return
    setDrafts((p) => ({ ...p, [activeFile]: contents[activeFile] ?? '' }))
  }

  const entry = activeFile ? files.find((f) => f.name === activeFile) : null
  const isDirty = activeFile ? (drafts[activeFile] ?? '') !== (contents[activeFile] ?? '') : false
  const lineCount = activeFile ? (drafts[activeFile] ?? '').split('\n').length : 0
  const dirtyFiles = useMemo(
    () => new Set(openTabs.filter((t) => (drafts[t] ?? '') !== (contents[t] ?? ''))),
    [openTabs, drafts, contents],
  )

  const folders = useMemo(() => {
    const tree: Record<string, AgentFileEntry[]> = { '/': [] }
    for (const f of files) {
      const parts = f.name.split('/')
      if (parts.length > 1) {
        const folder = parts.slice(0, -1).join('/')
        if (!tree[folder]) {
          tree[folder] = []
        }
        tree[folder].push(f)
      } else {
        tree['/'].push(f)
      }
    }
    return tree
  }, [files])

  let explorerContent: React.ReactNode
  if (loading) {
    explorerContent = (
      <div className="p-3 space-y-2">
        {Array.from({ length: 5 }, (_unused, n) => `explorer-skeleton-${n + 1}`).map((id) => (
          <Skeleton key={id} className="h-8 w-full" />
        ))}
      </div>
    )
  } else if (files.length === 0) {
    explorerContent = (
      <div className="p-6 text-center">
        <File className="mx-auto h-5 w-5 text-muted-foreground/20 mb-2" />
        <p className="text-xs text-muted-foreground/40">No files</p>
      </div>
    )
  } else {
    explorerContent = (
      <div className="py-1">
        {Object.entries(folders).map(([folder, folderFiles]) => (
          <div key={folder}>
            {folder !== '/' && (
              <div className="flex items-center gap-1.5 px-3 py-1.5">
                <span className="text-sm">📁</span>
                <span className="text-[10px] font-semibold text-muted-foreground/60">{folder}</span>
              </div>
            )}
            {folderFiles.map((f) => (
              <button
                type="button"
                key={f.name}
                onClick={() => void selectFile(f.name)}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-1.5 text-left transition-all duration-150',
                  'hover:bg-accent/50',
                  activeFile === f.name && 'bg-accent/80',
                  folder !== '/' && 'pl-6',
                )}
              >
                <span className="text-sm shrink-0">{getFileEmoji(f.name)}</span>
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      'font-mono text-[11px] truncate',
                      activeFile === f.name ? 'text-primary' : 'text-foreground',
                    )}
                  >
                    {f.name.split('/').pop()}
                  </p>
                </div>
                {f.missing && <AlertTriangle className="h-3 w-3 text-yellow-500 shrink-0" />}
              </button>
            ))}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-border/50 bg-card/80 backdrop-blur-sm overflow-hidden">
      <div className="flex min-h-[500px]">
        {/* === FILE TREE === */}
        <div className="w-56 shrink-0 border-r border-border/50 bg-muted/10 hidden md:flex flex-col">
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/30">
            <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground/60">Explorer</p>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void loadFiles()}
              disabled={loading}
              className="h-6 w-6 p-0"
            >
              <RefreshCw className={cn('h-3 w-3 text-muted-foreground/50', loading && 'animate-spin')} />
            </Button>
          </div>
          {workspace && (
            <div className="flex items-center gap-1 px-3 py-1.5 text-[9px] font-mono text-muted-foreground/40 border-b border-border/20">
              <FolderOpen className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate">{workspace.split('/').pop()}</span>
            </div>
          )}
          <ScrollArea className="flex-1">{explorerContent}</ScrollArea>
        </div>

        {/* === EDITOR AREA === */}
        <div className="flex flex-1 flex-col min-w-0">
          {/* Open file tabs */}
          {openTabs.length > 0 && (
            <div
              className="flex border-b border-border/30 bg-muted/10 overflow-x-auto"
              style={{ scrollbarWidth: 'none' }}
            >
              {openTabs.map((tab) => (
                <div
                  key={tab}
                  className={cn(
                    'flex items-center border-r border-border/20 shrink-0 transition-colors duration-150',
                    activeFile === tab ? 'bg-background border-b-2 border-b-primary' : 'hover:bg-accent/30',
                  )}
                >
                  <button
                    type="button"
                    className={cn(
                      'flex items-center gap-1.5 pl-3 pr-1 py-2 text-[11px] font-mono',
                      activeFile === tab ? 'text-foreground' : 'text-muted-foreground',
                    )}
                    onClick={() => setActiveFile(tab)}
                  >
                    <span className="text-xs">{getFileEmoji(tab)}</span>
                    <span className="truncate max-w-[120px]">{tab.split('/').pop()}</span>
                    {dirtyFiles.has(tab) && <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => closeTab(tab)}
                    className="mr-1.5 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label={`Close ${tab.split('/').pop()}`}
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {!activeFile || !entry ? (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center">
                <FolderOpen className="mx-auto h-8 w-8 text-muted-foreground/15 mb-3" />
                <p className="text-sm text-muted-foreground/40">Select a file to view or edit</p>
                <p className="text-[10px] text-muted-foreground/25 mt-1">Choose from the explorer on the left</p>
              </div>
            </div>
          ) : (
            <>
              {/* Breadcrumb */}
              <div className="flex items-center justify-between border-b border-border/30 px-3 py-1.5 bg-muted/5">
                <div className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground/50 min-w-0">
                  <span className="truncate">{workspace.split('/').pop() || 'workspace'}</span>
                  <ChevronRight className="h-2.5 w-2.5 shrink-0" />
                  <span className="text-foreground truncate">{entry.name}</span>
                </div>
                {isDirty && (
                  <Badge variant="secondary" className="text-[8px]">
                    unsaved
                  </Badge>
                )}
              </div>

              {entry.missing && (
                <div className="flex items-center gap-2 border-b border-yellow-500/10 bg-yellow-500/5 px-3 py-1.5">
                  <AlertTriangle className="h-3 w-3 text-yellow-500" />
                  <span className="text-[10px] text-yellow-600 dark:text-yellow-400">
                    File missing — saving will create it
                  </span>
                </div>
              )}

              {/* Editor with line numbers */}
              {loadingFile ? (
                <div className="flex-1 p-4 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-4 w-5/6" />
                </div>
              ) : (
                <div className="flex flex-1 overflow-hidden relative">
                  {/* Line numbers gutter */}
                  <div className="w-10 shrink-0 bg-muted/20 border-r border-border/30 pt-3 select-none overflow-hidden">
                    {Array.from({ length: Math.max(lineCount, 25) }, (_unused, n) => n + 1).map((lineNumber) => (
                      <div
                        key={lineNumber}
                        className="px-2 text-right font-mono text-[10px] leading-[1.65rem] text-muted-foreground/20"
                      >
                        {lineNumber}
                      </div>
                    ))}
                  </div>
                  <Textarea
                    value={drafts[activeFile] ?? ''}
                    onChange={(e) => {
                      if (!activeFile) return
                      setDrafts((prev) => ({ ...prev, [activeFile]: e.target.value }))
                    }}
                    className="flex-1 resize-none p-3 font-mono text-xs leading-[1.65rem] text-foreground placeholder:text-muted-foreground/20 border-0 shadow-none focus-visible:ring-0 rounded-none min-h-0"
                    placeholder="File content…"
                    spellCheck={false}
                  />

                  {/* Floating save/reset */}
                  {isDirty && (
                    <div className="absolute bottom-4 right-4 flex gap-2">
                      <Button size="sm" variant="outline" onClick={resetDraft} className="h-8 shadow-lg">
                        <RotateCcw className="mr-1 h-3 w-3" /> Reset
                      </Button>
                      <Button size="sm" onClick={() => void saveFile()} disabled={saving} className="h-8 shadow-lg">
                        <Save className="mr-1 h-3 w-3" /> {saving ? 'Saving…' : 'Save'}
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Status bar */}
              <div className="flex items-center justify-between border-t border-border/30 px-3 py-1 bg-muted/10">
                <div className="flex items-center gap-3">
                  <span className="text-[9px] font-mono text-muted-foreground/40">{lineCount} lines</span>
                  <span className="text-[9px] font-mono text-muted-foreground/40">
                    {formatBytes(new Blob([drafts[activeFile] ?? '']).size)}
                  </span>
                </div>
                <span className="text-[9px] font-mono text-muted-foreground/30">UTF-8</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
