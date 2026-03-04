import { Paperclip, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AttachmentFile } from '../types'
import { FILE_ICONS } from '../types'

function attachmentSizeLabel(attachment: AttachmentFile): React.ReactNode | null {
  if (!attachment.textContent) return null
  if (attachment.truncated) return <span className="text-yellow-500"> · Truncated (200K chars)</span>
  return <span className="text-primary"> · Ready</span>
}

function AttachmentThumbnail({
  attachment,
  icon,
}: {
  readonly attachment: AttachmentFile
  readonly icon: string | undefined
}) {
  if (attachment.preview) {
    return <img src={attachment.preview} alt={attachment.file.name} className="h-8 w-8 rounded object-cover shrink-0" />
  }
  if (icon) {
    return <div className="flex h-8 w-8 items-center justify-center rounded bg-muted shrink-0 text-base">{icon}</div>
  }
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded bg-muted shrink-0">
      <Paperclip className="h-3 w-3 text-muted-foreground" />
    </div>
  )
}

function AttachmentPreview({
  attachment,
  onRemove,
}: {
  readonly attachment: AttachmentFile
  readonly onRemove: (id: string) => void
}) {
  const ext = attachment.file.name.split('.').pop()?.toUpperCase() || ''
  const icon = FILE_ICONS[attachment.mimeType]

  return (
    <div
      className={cn(
        'relative flex items-center gap-2 rounded-lg border p-1.5 max-w-[200px]',
        attachment.error ? 'border-destructive/40 bg-destructive/5' : 'border-border bg-card/50',
      )}
    >
      <AttachmentThumbnail attachment={attachment} icon={icon} />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-medium text-foreground truncate">{attachment.file.name}</p>
        {attachment.error ? (
          <p className="text-[9px] text-destructive">{attachment.error}</p>
        ) : (
          <p className="text-[9px] text-muted-foreground">
            {ext} · {(attachment.file.size / 1024).toFixed(0)} KB
            {attachmentSizeLabel(attachment)}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onRemove(attachment.id)}
        className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-muted-foreground text-background text-[8px] hover:bg-foreground transition-colors"
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </div>
  )
}

export function AttachmentStrip({
  attachments,
  onRemove,
}: {
  readonly attachments: AttachmentFile[]
  readonly onRemove: (id: string) => void
}) {
  if (attachments.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-2 px-3 pt-2">
      {attachments.map((a) => (
        <AttachmentPreview key={a.id} attachment={a} onRemove={onRemove} />
      ))}
    </div>
  )
}
