import { useCallback, useSyncExternalStore } from 'react'

const STORAGE_KEY = 'clawkernel-time-format'
type TimeFormat = '12h' | '24h'

const listeners = new Set<() => void>()

function getSnapshot(): TimeFormat {
  return (localStorage.getItem(STORAGE_KEY) as TimeFormat) ?? '24h'
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

function setFormat(format: TimeFormat) {
  localStorage.setItem(STORAGE_KEY, format)
  for (const cb of listeners) cb()
}

/** Shared 12h/24h preference backed by localStorage. */
export function useTimeFormat() {
  const format = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const toggle = useCallback(() => setFormat(format === '24h' ? '12h' : '24h'), [format])
  const is24h = format === '24h'
  return { format, is24h, toggle } as const
}

/** Format a timestamp (ms) to time string using the stored preference. */
export function formatTimestamp(ms: number, is24h: boolean): string {
  return new Date(ms).toLocaleTimeString('en-US', {
    hour12: !is24h,
    hour: '2-digit',
    minute: '2-digit',
  })
}
