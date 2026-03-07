//  Structured logger — lightweight, production-safe
//
//  All chat/gateway errors flow through here so they're:
//  1. Visible in DevTools (with context)
//  2. Easy to hook into external error reporting (Sentry, etc.)
//  3. Never silently swallowed

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

type LogEntry = {
  level: LogLevel
  scope: string
  message: string
  error?: unknown
  data?: Record<string, unknown>
}

type LogHandler = (entry: LogEntry) => void

const handlers: LogHandler[] = []

/** Register an external log handler (e.g. Sentry, analytics). @public */
export function addLogHandler(handler: LogHandler): () => void {
  handlers.push(handler)
  return () => {
    const idx = handlers.indexOf(handler)
    if (idx >= 0) handlers.splice(idx, 1)
  }
}

function emit(entry: LogEntry) {
  // Console output (always, in dev and prod)
  const tag = `[${entry.scope}]`
  const args: unknown[] = [tag, entry.message]
  if (entry.data) args.push(entry.data)
  if (entry.error) args.push(entry.error)

  switch (entry.level) {
    case 'debug':
      console.debug(...args)
      break
    case 'info':
      console.info(...args)
      break
    case 'warn':
      console.warn(...args)
      break
    case 'error':
      console.error(...args)
      break
  }

  // External handlers
  for (const h of handlers) {
    try {
      h(entry)
    } catch {
      // Never let a handler crash the app
    }
  }
}

/** Create a scoped logger instance. */
export function createLogger(scope: string) {
  return {
    debug: (message: string, data?: Record<string, unknown>) => emit({ level: 'debug', scope, message, data }),
    info: (message: string, data?: Record<string, unknown>) => emit({ level: 'info', scope, message, data }),
    warn: (message: string, error?: unknown, data?: Record<string, unknown>) =>
      emit({ level: 'warn', scope, message, error, data }),
    error: (message: string, error?: unknown, data?: Record<string, unknown>) =>
      emit({ level: 'error', scope, message, error, data }),
  }
}
