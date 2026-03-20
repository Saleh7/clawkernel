import {
  Download,
  Edit3,
  FolderPlus,
  GripVertical,
  Pin,
  PinOff,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
  Zap,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import {
  createCategory,
  createPrompt,
  deleteCategory,
  deletePrompt,
  exportPrompts,
  fetchPrompts,
  importPrompts,
  type Prompt,
  type PromptCategory,
  recordPromptUsage,
  reorderPrompts,
  updateCategory,
  updatePrompt,
} from '../lib/prompts-api'

function timeAgo(ts: number | null): string {
  if (!ts) return 'Never used'
  const diff = Math.floor(Date.now() / 1000) - ts
  if (diff < 60) return 'Just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

type FormData = { title: string; content: string; categoryId: string }

function PromptForm({
  initial,
  categories,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  readonly initial?: FormData
  readonly categories: PromptCategory[]
  readonly onSubmit: (data: FormData) => void
  readonly onCancel: () => void
  readonly submitLabel: string
}) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [content, setContent] = useState(initial?.content ?? '')
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? categories[0]?.id ?? '')
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Small delay to avoid dialog focus race
    const t = setTimeout(() => titleRef.current?.focus(), 50)
    return () => clearTimeout(t)
  }, [])

  const handleSubmit = () => {
    if (!title.trim() || !content.trim() || !categoryId) return
    onSubmit({ title, content, categoryId })
  }

  return (
    <div className="border-t border-border bg-muted/30 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-foreground">
          {submitLabel === 'Create' ? 'New Prompt' : 'Edit Prompt'}
        </span>
      </div>
      <Input
        ref={titleRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Prompt title"
        className="h-8 text-xs"
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
      />
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Prompt content... Use {{variable}} for placeholders"
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs min-h-[80px] resize-none focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel()
        }}
      />
      <div className="flex items-center gap-2">
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1.5 ml-auto">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" className="h-7 text-xs" disabled={!title.trim() || !content.trim()} onClick={handleSubmit}>
            {submitLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

function PromptCard({
  prompt,
  onSelect,
  onEdit,
  onDelete,
  onTogglePin,
  dragHandleProps,
}: {
  readonly prompt: Prompt
  readonly onSelect: () => void
  readonly onEdit: () => void
  readonly onDelete: () => void
  readonly onTogglePin: () => void
  readonly dragHandleProps?: {
    onDragStart: (e: React.DragEvent) => void
    onDragOver: (e: React.DragEvent) => void
    onDrop: (e: React.DragEvent) => void
    draggable: boolean
  }
}) {
  return (
    <button
      type="button"
      className={cn(
        'group flex items-start gap-2.5 rounded-lg px-3 py-2.5 transition-all duration-150 w-full text-left',
        'hover:bg-accent/60 cursor-pointer border border-transparent bg-transparent',
        prompt.pinned && 'bg-primary/5 border-primary/10',
      )}
      onClick={onSelect}
      {...dragHandleProps}
    >
      <span className="mt-1 cursor-grab opacity-0 group-hover:opacity-40 transition-opacity shrink-0 inline-flex">
        <GripVertical className="h-3.5 w-3.5" />
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {prompt.pinned && <Pin className="h-3 w-3 text-primary shrink-0" />}
          <span className="text-xs font-medium text-foreground truncate">{prompt.title}</span>
        </div>
        <p className="text-[11px] text-muted-foreground/70 line-clamp-2 mt-0.5 leading-relaxed">{prompt.content}</p>
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-[10px] text-muted-foreground/50">{timeAgo(prompt.lastUsedAt)}</span>
          {prompt.usageCount > 0 && (
            <span className="text-[10px] text-muted-foreground/50">· Used {prompt.usageCount}×</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5">
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={(e) => {
                  e.stopPropagation()
                  onTogglePin()
                }}
              >
                {prompt.pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-[10px]">
              {prompt.pinned ? 'Unpin' : 'Pin'}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={(e) => {
                  e.stopPropagation()
                  onEdit()
                }}
              >
                <Edit3 className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-[10px]">
              Edit
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete()
                }}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-[10px]">
              Delete
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </button>
  )
}

function CategoryHeader({
  category,
  count,
  onRename,
  onDelete,
}: {
  readonly category: PromptCategory
  readonly count: number
  readonly onRename: (name: string) => void
  readonly onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(category.name)

  const handleSubmit = () => {
    if (name.trim() && name.trim() !== category.name) onRename(name.trim())
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={handleSubmit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit()
            if (e.key === 'Escape') setEditing(false)
          }}
          className="h-6 text-[11px] font-semibold"
          autoFocus
        />
      </div>
    )
  }

  return (
    <div className="group/cat flex items-center justify-between px-3 py-2 mt-1 first:mt-0">
      <button
        type="button"
        className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
        onDoubleClick={() => setEditing(true)}
      >
        {category.name} <span className="text-muted-foreground/40 font-normal normal-case">({count})</span>
      </button>
      <Button
        variant="ghost"
        size="icon"
        className="h-5 w-5 opacity-0 group-hover/cat:opacity-60 hover:!opacity-100 hover:text-destructive transition-opacity"
        onClick={onDelete}
      >
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  )
}

export function PromptLibrary({
  onSelect,
  disabled,
}: {
  readonly onSelect: (content: string) => void
  readonly disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [categories, setCategories] = useState<PromptCategory[]>([])
  const [allPrompts, setAllPrompts] = useState<Prompt[]>([])
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null)
  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [showNewCategory, setShowNewCategory] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const data = await fetchPrompts()
    setCategories(data.categories)
    setAllPrompts(data.prompts)
  }, [])

  useEffect(() => {
    if (open) {
      load()
      // Reset state on open
      setSearch('')
      setFormMode(null)
      setEditingPrompt(null)
      setShowNewCategory(false)
    }
  }, [open, load])

  const filtered = useMemo(() => {
    let list = allPrompts
    if (activeCategory) list = list.filter((p) => p.categoryId === activeCategory)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((p) => p.title.toLowerCase().includes(q) || p.content.toLowerCase().includes(q))
    }
    const pinned = list.filter((p) => p.pinned).sort((a, b) => a.sortOrder - b.sortOrder)
    const unpinned = list.filter((p) => !p.pinned).sort((a, b) => a.sortOrder - b.sortOrder)
    return [...pinned, ...unpinned]
  }, [allPrompts, activeCategory, search])

  const grouped = useMemo(() => {
    const map = new Map<string, Prompt[]>()
    for (const p of filtered) {
      const arr = map.get(p.categoryId) || []
      arr.push(p)
      map.set(p.categoryId, arr)
    }
    return map
  }, [filtered])

  const handleSelect = async (prompt: Prompt) => {
    onSelect(prompt.content)
    void recordPromptUsage(prompt.id)
    setAllPrompts((prev) =>
      prev.map((p) =>
        p.id === prompt.id ? { ...p, usageCount: p.usageCount + 1, lastUsedAt: Math.floor(Date.now() / 1000) } : p,
      ),
    )
    setOpen(false)
  }

  const handleCreate = async (data: FormData) => {
    const res = await createPrompt(data)
    if (res.ok) {
      setAllPrompts((prev) => [...prev, res.prompt])
      setFormMode(null)
    }
  }

  const handleEdit = async (data: FormData) => {
    if (!editingPrompt) return
    await updatePrompt(editingPrompt.id, data)
    setAllPrompts((prev) =>
      prev.map((p) => (p.id === editingPrompt.id ? { ...p, ...data, updatedAt: Math.floor(Date.now() / 1000) } : p)),
    )
    setFormMode(null)
    setEditingPrompt(null)
  }

  const handleDelete = async (id: string) => {
    await deletePrompt(id)
    setAllPrompts((prev) => prev.filter((p) => p.id !== id))
  }

  const handleTogglePin = async (prompt: Prompt) => {
    const pinned = !prompt.pinned
    await updatePrompt(prompt.id, { pinned })
    setAllPrompts((prev) => prev.map((p) => (p.id === prompt.id ? { ...p, pinned } : p)))
  }

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return
    const res = await createCategory(newCategoryName.trim())
    if (res.ok) {
      setCategories((prev) => [...prev, res.category])
      setNewCategoryName('')
      setShowNewCategory(false)
    }
  }

  const handleRenameCategory = async (id: string, name: string) => {
    await updateCategory(id, name)
    setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, name } : c)))
  }

  const handleDeleteCategory = async (id: string) => {
    await deleteCategory(id)
    setCategories((prev) => prev.filter((c) => c.id !== id))
    setAllPrompts((prev) => prev.filter((p) => p.categoryId !== id))
    if (activeCategory === id) setActiveCategory(null)
  }

  const handleExport = async () => {
    const data = await exportPrompts()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `prompts-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    try {
      const text = await file.text()
      const data = JSON.parse(text) as unknown
      if (
        typeof data !== 'object' ||
        data === null ||
        !('version' in data) ||
        data.version !== 1 ||
        !('categories' in data) ||
        !Array.isArray(data.categories) ||
        !('prompts' in data) ||
        !Array.isArray(data.prompts)
      ) {
        toast.error('Invalid import format — expected version 1 with categories and prompts arrays')
        return
      }
      await importPrompts(data as { version: 1; categories: PromptCategory[]; prompts: Prompt[] })
      await load()
    } catch {
      toast.error('Failed to import — file is not valid JSON')
    }
  }

  const handleDragStart = (id: string) => (e: React.DragEvent) => {
    setDragId(id)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const applyReorder = useCallback((ids: string[]) => {
    setAllPrompts((prev) => {
      const updated = [...prev]
      for (let i = 0; i < ids.length; i++) {
        const idx = updated.findIndex((p) => p.id === ids[i])
        if (idx !== -1) updated[idx] = { ...updated[idx], sortOrder: i }
      }
      return updated
    })
  }, [])

  const handleDrop = (targetId: string) => (e: React.DragEvent) => {
    e.preventDefault()
    if (!dragId || dragId === targetId) return
    const ids = filtered.map((p) => p.id)
    const fromIdx = ids.indexOf(dragId)
    const toIdx = ids.indexOf(targetId)
    if (fromIdx === -1 || toIdx === -1) return
    ids.splice(fromIdx, 1)
    ids.splice(toIdx, 0, dragId)
    applyReorder(ids)
    setDragId(null)
    void reorderPrompts(ids)
  }

  const startEdit = useCallback((prompt: Prompt) => {
    setEditingPrompt(prompt)
    setFormMode('edit')
  }, [])

  const renderPromptCard = (prompt: Prompt) => (
    <PromptCard
      key={prompt.id}
      prompt={prompt}
      onSelect={() => {
        void handleSelect(prompt)
      }}
      onEdit={() => startEdit(prompt)}
      onDelete={() => handleDelete(prompt.id)}
      onTogglePin={() => handleTogglePin(prompt)}
      dragHandleProps={{
        draggable: true,
        onDragStart: handleDragStart(prompt.id),
        onDragOver: handleDragOver,
        onDrop: handleDrop(prompt.id),
      }}
    />
  )

  const renderPromptList = () => {
    if (filtered.length === 0 && !formMode) {
      return (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <div className="rounded-full bg-muted/50 p-3">
            <Zap className="h-6 w-6 text-muted-foreground/40" />
          </div>
          <div className="text-center space-y-1">
            <p className="text-sm font-medium text-muted-foreground/70">
              {search ? 'No prompts found' : 'No prompts yet'}
            </p>
            <p className="text-xs text-muted-foreground/40">
              {search ? 'Try a different search term' : 'Create your first prompt to get started'}
            </p>
          </div>
          {!search && (
            <Button variant="outline" size="sm" className="h-8 text-xs mt-2" onClick={() => setFormMode('create')}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Create prompt
            </Button>
          )}
        </div>
      )
    }

    if (!activeCategory && !search) {
      return categories
        .filter((cat) => grouped.has(cat.id))
        .map((cat) => (
          <div key={cat.id}>
            <CategoryHeader
              category={cat}
              count={grouped.get(cat.id)?.length ?? 0}
              onRename={(name) => handleRenameCategory(cat.id, name)}
              onDelete={() => handleDeleteCategory(cat.id)}
            />
            <div className="space-y-0.5 px-1">{grouped.get(cat.id)?.map((prompt) => renderPromptCard(prompt))}</div>
          </div>
        ))
    }

    return <div className="space-y-0.5 px-1">{filtered.map((prompt) => renderPromptCard(prompt))}</div>
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'h-7 w-7 rounded-md',
                  open ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground',
                )}
                disabled={disabled}
              >
                <Zap className="h-4 w-4" />
              </Button>
            </DialogTrigger>
          </TooltipTrigger>
          <TooltipContent>Prompt Library</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <DialogContent
        className="max-w-lg p-0 gap-0 overflow-hidden flex flex-col max-h-[min(600px,85vh)]"
        showCloseButton={false}
      >
        <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleImport} />

        {/* Header */}
        <DialogHeader className="px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-sm font-semibold flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              Prompt Library
              {allPrompts.length > 0 && (
                <span className="text-[10px] text-muted-foreground/50 font-normal">
                  {allPrompts.length} prompt{allPrompts.length === 1 ? '' : 's'}
                </span>
              )}
            </DialogTitle>
            <div className="flex items-center gap-1">
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleExport}>
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="text-[10px]">Export all</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="text-[10px]">Import</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setFormMode('create')}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="text-[10px]">New prompt</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <Button variant="ghost" size="icon" className="h-7 w-7 ml-1" onClick={() => setOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Search & Filters */}
        <div className="px-4 py-3 border-b border-border space-y-2.5 shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
            <Input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search prompts..."
              className="h-8 pl-8 text-xs"
            />
            {search && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-5 w-5"
                onClick={() => setSearch('')}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setActiveCategory(null)}
              className={cn(
                'rounded-full px-3 py-1 text-[11px] transition-colors border font-medium',
                activeCategory
                  ? 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
                  : 'bg-primary text-primary-foreground border-primary',
              )}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(activeCategory === cat.id ? null : cat.id)}
                className={cn(
                  'rounded-full px-3 py-1 text-[11px] transition-colors border font-medium',
                  activeCategory === cat.id
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30',
                )}
              >
                {cat.name}
              </button>
            ))}
            {showNewCategory ? (
              <div className="flex items-center gap-1">
                <Input
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="Category name"
                  className="h-6 w-28 text-[11px] px-2"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateCategory()
                    if (e.key === 'Escape') setShowNewCategory(false)
                  }}
                />
                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setShowNewCategory(false)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowNewCategory(true)}
                className="rounded-full px-2 py-1 text-[11px] border border-dashed border-border text-muted-foreground/50 hover:text-foreground hover:border-foreground/30 transition-colors"
                title="Add category"
              >
                <FolderPlus className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Prompt List OR Form — never both */}
        {formMode === 'create' && (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <PromptForm
              categories={categories}
              onSubmit={handleCreate}
              onCancel={() => setFormMode(null)}
              submitLabel="Create"
            />
          </div>
        )}
        {formMode === 'edit' && editingPrompt && (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <PromptForm
              initial={{
                title: editingPrompt.title,
                content: editingPrompt.content,
                categoryId: editingPrompt.categoryId,
              }}
              categories={categories}
              onSubmit={handleEdit}
              onCancel={() => {
                setFormMode(null)
                setEditingPrompt(null)
              }}
              submitLabel="Save"
            />
          </div>
        )}
        {!formMode && (
          <ScrollArea className="flex-1 min-h-0">
            <div className="py-1">{renderPromptList()}</div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  )
}
