// Web Search page — shared types

export type WebSearchProvider = 'brave' | 'perplexity' | 'grok' | 'gemini' | 'kimi'

/** Ordered list of all supported providers — single source of truth. */
export const PROVIDER_LIST = [
  'brave',
  'perplexity',
  'grok',
  'gemini',
  'kimi',
] as const satisfies readonly WebSearchProvider[]

export type WebSearchConfig = {
  enabled?: boolean
  provider?: WebSearchProvider
  /** Brave Search API key (config-stored, not env-var). */
  apiKey?: string
  maxResults?: number
  cacheTtlMinutes?: number
  perplexity?: {
    apiKey?: string
    baseUrl?: string
    model?: string
  }
  grok?: {
    apiKey?: string
    model?: string
  }
  gemini?: {
    apiKey?: string
    model?: string
  }
  kimi?: {
    apiKey?: string
    baseUrl?: string
    model?: string
  }
}

export type PlaygroundState = {
  running: boolean
  /** Full accumulated response text (each delta replaces, not appends). */
  text: string
  status: 'idle' | 'streaming' | 'done' | 'error'
  errorMessage: string | null
  durationMs: number | null
  /** Active provider at the time the search was started. */
  provider: string | null
}
