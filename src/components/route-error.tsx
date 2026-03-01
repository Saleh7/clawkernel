import { useRouteError } from 'react-router'

export function RouteError() {
  const error = useRouteError()
  const message = error instanceof Error ? error.message : 'An unexpected error occurred'

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-2xl border border-destructive/30 bg-card/80 backdrop-blur-sm p-8 text-center shadow-lg">
        <h1 className="text-xl font-bold text-foreground mb-2">Something went wrong</h1>
        <p className="text-sm text-muted-foreground mb-4">{message}</p>
        {import.meta.env.DEV && error instanceof Error && error.stack && (
          <pre className="text-left text-xs text-muted-foreground bg-muted rounded-lg p-3 mb-4 overflow-auto max-h-48">
            {error.stack}
          </pre>
        )}
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Reload page
        </button>
      </div>
    </div>
  )
}
