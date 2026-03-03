import { X } from 'lucide-react'
import { useUpdateCheck } from '@/hooks/use-update-check'

/**
 * Dismissible banner shown when a newer ClawKernel version is available on npm.
 * Hidden when: no update available, already dismissed, or server unreachable.
 */
export function UpdateBanner() {
  const { info, dismiss } = useUpdateCheck()

  if (!info?.updateAvailable || info.isDismissed) return null

  const handleDismiss = () => {
    if (info.latest) void dismiss(info.latest)
  }

  return (
    <div className="flex items-center justify-between gap-3 border-b border-primary/20 bg-primary/10 px-4 py-2 text-xs text-primary">
      <span>
        ClawKernel {info.latest} is available —{' '}
        <a
          href="https://www.npmjs.com/package/clawkernel"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 transition-opacity hover:opacity-80"
        >
          npm install -g clawkernel
        </a>
      </span>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss update notification"
        className="shrink-0 rounded p-0.5 text-primary/60 transition-colors hover:bg-primary/10 hover:text-primary"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
