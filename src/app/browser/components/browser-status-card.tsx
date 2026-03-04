import { CheckCircle2, CircleDashed, CircleX, ExternalLink, Globe } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { BrowserStatus } from '../types'

type Props = {
  readonly status: BrowserStatus | null
  readonly loading: boolean
  readonly disabled: boolean
  readonly error: string | null
}

export function BrowserStatusCard({ status, loading, disabled, error }: Props) {
  if (loading) {
    return (
      <div className="rounded-xl border bg-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Globe className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-semibold">Browser Status</p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_unused, n) => `browser-status-skeleton-${n + 1}`).map((id) => (
            <div key={id} className="h-12 animate-pulse rounded-lg bg-muted/40" />
          ))}
        </div>
      </div>
    )
  }

  if (disabled) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-amber-400" />
          <p className="text-sm font-semibold text-amber-300">Browser Control Disabled</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Browser control is not enabled in Gateway config. Enable it to use{' '}
          <code className="rounded bg-muted px-1 py-px">browser.request</code>.
        </p>
        <a
          href="https://docs.openclaw.ai/tools/browser"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          Browser Control docs <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    )
  }

  if (error && !status) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 space-y-2">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-semibold">Browser Status</p>
        </div>
        <p className="text-xs text-destructive">{error}</p>
      </div>
    )
  }

  const tiles = [
    {
      label: 'Running',
      value: status?.running ? 'Yes' : 'No',
      ok: Boolean(status?.running),
    },
    {
      label: 'CDP Ready',
      value: status?.cdpReady ? 'Yes' : 'No',
      ok: Boolean(status?.cdpReady),
    },
    {
      label: 'Profile',
      value: status?.profile || '—',
      ok: Boolean(status?.profile),
    },
    {
      label: 'Browser',
      value: status?.chosenBrowser || status?.detectedBrowser || '—',
      ok: Boolean(status?.chosenBrowser || status?.detectedBrowser),
    },
  ]

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">Browser Status</p>
        </div>
        <StatusPill running={Boolean(status?.running)} cdpReady={Boolean(status?.cdpReady)} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => (
          <StatusTile key={t.label} label={t.label} value={t.value} ok={t.ok} />
        ))}
      </div>

      {status?.cdpUrl && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
          <span className="text-xs text-muted-foreground shrink-0">CDP:</span>
          <code className="text-xs text-foreground/70 truncate">{status.cdpUrl}</code>
        </div>
      )}

      {status?.detectError && <p className="text-xs text-destructive">{status.detectError}</p>}
    </div>
  )
}

type BrowserPillMode = 'ready' | 'starting' | 'stopped'

function getBrowserPillMode(running: boolean, cdpReady: boolean): BrowserPillMode {
  if (running && cdpReady) return 'ready'
  if (running) return 'starting'
  return 'stopped'
}

const BROWSER_PILL_TONE: Record<BrowserPillMode, string> = {
  ready: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  starting: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  stopped: 'border-border bg-muted/30 text-muted-foreground',
}

const BROWSER_PILL_LABEL: Record<BrowserPillMode, string> = {
  ready: 'Ready',
  starting: 'Starting',
  stopped: 'Not running',
}

function BrowserPillIcon({ mode }: { readonly mode: BrowserPillMode }) {
  if (mode === 'ready') return <CheckCircle2 className="h-3 w-3" />
  if (mode === 'starting') return <CircleDashed className="h-3 w-3" />
  return <CircleX className="h-3 w-3" />
}

function StatusPill({ running, cdpReady }: { readonly running: boolean; readonly cdpReady: boolean }) {
  const mode = getBrowserPillMode(running, cdpReady)
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
        BROWSER_PILL_TONE[mode],
      )}
    >
      <BrowserPillIcon mode={mode} />
      {BROWSER_PILL_LABEL[mode]}
    </span>
  )
}

function StatusTile({ label, value, ok }: { readonly label: string; readonly value: string; readonly ok: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
      <p className="text-xs uppercase tracking-wider text-muted-foreground/60">{label}</p>
      <p className={cn('mt-0.5 text-sm font-medium truncate', ok ? 'text-foreground/90' : 'text-muted-foreground')}>
        {value}
      </p>
    </div>
  )
}
