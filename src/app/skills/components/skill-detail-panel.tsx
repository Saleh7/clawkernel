import { AlertCircle, CheckCircle2, Download, ExternalLink, KeyRound, Terminal, X } from 'lucide-react'
import { useRef } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { SkillStatusEntry } from '@/lib/gateway/types'
import { cn } from '@/lib/utils'

type Props = {
  readonly skill: SkillStatusEntry
  readonly enabled: boolean
  readonly busy: boolean
  readonly onClose: () => void
  readonly onToggle: () => void
  readonly onInstall: (installId: string) => void
  readonly onSetApiKey: (apiKey: string) => void
}

function MissingRow({ label, items }: { readonly label: string; readonly items: string[] }) {
  if (items.length === 0) return null
  return (
    <div className="flex items-start gap-2">
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
      <div>
        <p className="text-[11px] font-medium text-foreground">{label}</p>
        <div className="mt-0.5 flex flex-wrap gap-1">
          {items.map((item) => (
            <code key={item} className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
              {item}
            </code>
          ))}
        </div>
      </div>
    </div>
  )
}

function RequiredRow({ label, items }: { readonly label: string; readonly items: string[] }) {
  if (items.length === 0) return null
  return (
    <div className="flex items-start gap-2">
      <Terminal className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
      <div>
        <p className="text-[11px] font-medium text-foreground">{label}</p>
        <div className="mt-0.5 flex flex-wrap gap-1">
          {items.map((item) => (
            <code key={item} className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
              {item}
            </code>
          ))}
        </div>
      </div>
    </div>
  )
}

export function SkillDetailPanel({ skill, enabled, busy, onClose, onToggle, onInstall, onSetApiKey }: Props) {
  const apiKeyRef = useRef<HTMLInputElement>(null)

  const hasMissing =
    skill.missing.bins.length > 0 ||
    skill.missing.env.length > 0 ||
    skill.missing.config.length > 0 ||
    skill.missing.os.length > 0

  const handleKeySubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    const val = apiKeyRef.current?.value.trim()
    if (val) {
      onSetApiKey(val)
      if (apiKeyRef.current) apiKeyRef.current.value = ''
    }
  }

  return (
    <>
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close panel"
        className="fixed inset-0 z-40 w-full cursor-default bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-background shadow-2xl border-l border-border">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-border p-5">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-3xl shrink-0">{skill.emoji || '🔧'}</span>
            <div className="min-w-0">
              <p className="font-semibold text-foreground truncate">{skill.name}</p>
              <p className="text-xs text-muted-foreground/70 mt-0.5 font-mono truncate">{skill.skillKey}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-muted-foreground/40 transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Description */}
          <p className="text-sm text-muted-foreground leading-relaxed">{skill.description}</p>

          {/* Status + toggle */}
          <div className="flex items-center justify-between rounded-xl border border-border bg-muted/20 p-3">
            <div className="flex items-center gap-2">
              {enabled && !hasMissing ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              ) : (
                <AlertCircle className={cn('h-4 w-4', hasMissing ? 'text-amber-500' : 'text-muted-foreground/40')} />
              )}
              <div>
                <p className="text-xs font-semibold text-foreground">{enabled ? 'Enabled' : 'Disabled'}</p>
                <p className="text-[10px] text-muted-foreground/60">
                  {skill.always ? 'Always active (cannot disable)' : 'Click to toggle'}
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant={enabled ? 'outline' : 'default'}
              disabled={busy || skill.always}
              onClick={onToggle}
              className="text-xs"
            >
              {enabled ? 'Disable' : 'Enable'}
            </Button>
          </div>

          {/* Badges */}
          <div className="flex flex-wrap gap-1.5">
            {skill.bundled && (
              <Badge variant="secondary" className="text-[10px]">
                built-in
              </Badge>
            )}
            {skill.always && (
              <Badge variant="secondary" className="text-[10px]">
                always active
              </Badge>
            )}
            {skill.blockedByAllowlist && (
              <Badge variant="outline" className="text-[10px] border-red-500/30 text-red-500">
                blocked by allowlist
              </Badge>
            )}
            <Badge variant="outline" className="text-[10px]">
              {skill.source}
            </Badge>
          </div>

          {/* Requirements */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Requirements</p>
            <RequiredRow label="Binaries" items={skill.requirements.bins} />
            <RequiredRow label="Environment vars" items={skill.requirements.env} />
            <RequiredRow label="Config keys" items={skill.requirements.config} />
            <RequiredRow label="OS" items={skill.requirements.os} />
            {skill.requirements.bins.length === 0 &&
              skill.requirements.env.length === 0 &&
              skill.requirements.config.length === 0 &&
              skill.requirements.os.length === 0 && (
                <p className="text-xs text-muted-foreground/50">No special requirements</p>
              )}
          </div>

          {/* Missing items */}
          {hasMissing && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 space-y-3">
              <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">Missing</p>
              <MissingRow label="Binaries" items={skill.missing.bins} />
              <MissingRow label="Environment vars" items={skill.missing.env} />
              <MissingRow label="Config keys" items={skill.missing.config} />
              <MissingRow label="OS requirements" items={skill.missing.os} />
            </div>
          )}

          {/* Install options */}
          {skill.install.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Install Dependencies
              </p>
              {skill.install.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  disabled={busy}
                  onClick={() => onInstall(opt.id)}
                  className="flex w-full items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2.5 text-xs transition-colors hover:bg-muted/40 disabled:opacity-40"
                >
                  <Download className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="flex-1 text-left font-medium text-foreground">{opt.label}</span>
                  {opt.bins.length > 0 && (
                    <span className="text-muted-foreground/50 font-mono text-[10px]">{opt.bins.join(', ')}</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* API key form */}
          {skill.missing.env.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">API Key</p>
              <form onSubmit={handleKeySubmit} className="flex gap-2">
                <div className="relative flex-1">
                  <KeyRound className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/40" />
                  <input
                    ref={apiKeyRef}
                    type="password"
                    placeholder={`Enter ${skill.missing.env[0]}`}
                    className="w-full rounded-lg border border-border bg-card pl-7 pr-3 py-2 text-xs font-mono placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/50"
                  />
                </div>
                <Button type="submit" size="sm" disabled={busy}>
                  Save
                </Button>
              </form>
            </div>
          )}

          {/* Homepage */}
          {skill.homepage && (
            <a
              href={skill.homepage}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:opacity-80 transition-opacity"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              View documentation
            </a>
          )}

          {/* Source path */}
          <div className="rounded-lg border border-border/40 bg-muted/10 px-3 py-2">
            <p className="text-[9px] font-medium text-muted-foreground/50 uppercase tracking-wider mb-0.5">
              Source path
            </p>
            <p className="text-[10px] font-mono text-muted-foreground/70 break-all">{skill.filePath}</p>
          </div>
        </div>
      </div>
    </>
  )
}
