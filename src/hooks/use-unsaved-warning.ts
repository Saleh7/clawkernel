import { useEffect } from 'react'

/**
 * Shows browser "unsaved changes" prompt when navigating away with dirty state.
 * Optionally binds Ctrl+S / Cmd+S to a save callback.
 */
export function useUnsavedWarning(isDirty: boolean, onSave?: () => void) {
  useEffect(() => {
    if (!isDirty) return

    const beforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }

    const keyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        onSave?.()
      }
    }

    window.addEventListener('beforeunload', beforeUnload)
    if (onSave) window.addEventListener('keydown', keyDown)
    return () => {
      window.removeEventListener('beforeunload', beforeUnload)
      if (onSave) window.removeEventListener('keydown', keyDown)
    }
  }, [isDirty, onSave])
}
