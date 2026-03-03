import { useEffect, useState } from 'react'

interface UpdateInfo {
  current: string | null
  latest: string | null
  updateAvailable: boolean
  isDismissed: boolean
  error: string | null
}

interface CachedCheck {
  data: UpdateInfo
  fetchedAt: number
}

const CACHE_KEY = 'ck_update_check'
const CACHE_TTL_MS = 60 * 60 * 1_000 // 1 hour — matches server-side cache

/**
 * Checks the ClawKernel npm registry for updates (via the local /api/version endpoint).
 * Results are cached in localStorage for 1 hour to avoid redundant requests.
 * Returns null while loading; returns UpdateInfo once resolved (may have null latest on network error).
 */
export function useUpdateCheck() {
  const [info, setInfo] = useState<UpdateInfo | null>(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY)
      if (raw) {
        const cached = JSON.parse(raw) as CachedCheck
        if (Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
          setInfo(cached.data)
          return
        }
      }
    } catch {}

    fetch('/api/version')
      .then((r) => r.json() as Promise<UpdateInfo>)
      .then((data) => {
        setInfo(data)
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({ data, fetchedAt: Date.now() }))
        } catch {}
      })
      .catch(() => {})
  }, [])

  // Optimistic: hide the banner immediately regardless of server response.
  // If the server is unreachable, the banner stays dismissed until cache
  // expires (1h) or page is hard-refreshed — acceptable UX tradeoff.
  const dismiss = async (version: string): Promise<void> => {
    setInfo((prev) => (prev ? { ...prev, isDismissed: true } : null))
    try {
      localStorage.removeItem(CACHE_KEY)
    } catch {}
    try {
      await fetch('/api/version/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version }),
      })
    } catch {}
  }

  return { info, dismiss }
}
