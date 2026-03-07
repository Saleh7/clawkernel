import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type ConfirmDialogProps = {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly title: string
  /** Optional icon rendered before the title text */
  readonly titleIcon?: React.ReactNode
  readonly description: React.ReactNode
  /**
   * When provided, the user must type this exact text to enable the action button.
   * Omit for a simple one-click confirmation.
   */
  readonly confirmText?: string
  /** Button label when idle */
  readonly actionLabel: string
  /** Button label while loading */
  readonly loadingLabel?: string
  readonly variant?: 'destructive' | 'default'
  readonly loading?: boolean
  readonly onConfirm: () => void | Promise<void>
  /** Optional extra content rendered between description and confirm input */
  readonly children?: React.ReactNode
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  titleIcon,
  description,
  confirmText,
  actionLabel,
  loadingLabel,
  variant = 'destructive',
  loading = false,
  onConfirm,
  children,
}: ConfirmDialogProps) {
  const [value, setValue] = useState('')

  const confirmed = confirmText ? value === confirmText : true

  const handleOpenChange = (next: boolean) => {
    if (!next) setValue('')
    onOpenChange(next)
  }

  const handleAction = () => {
    if (!confirmed || loading) return
    onConfirm()
  }

  const actionClass =
    variant === 'destructive' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : undefined

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {titleIcon ? (
              <span className="flex items-center gap-2">
                {titleIcon}
                {title}
              </span>
            ) : (
              title
            )}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div>{description}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {children}

        {confirmText && (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Type <span className="font-mono font-semibold text-foreground">{confirmText}</span> to confirm
            </Label>
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={confirmText}
              className="font-mono text-sm"
              autoFocus
            />
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={!confirmed || loading} onClick={handleAction} className={actionClass}>
            {loading ? (loadingLabel ?? actionLabel) : actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
