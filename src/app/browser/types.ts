export type { BrowserStatus } from '@/lib/gateway/types'

export type RequestMethod = 'GET' | 'POST' | 'DELETE'

// One entry in the request history (last 20, newest-first)
export type HistoryEntry = {
  id: string
  method: RequestMethod
  path: string
  ok: boolean
  durationMs: number
  responseBody: unknown
  errorMessage: string | null
}
