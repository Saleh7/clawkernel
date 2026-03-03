import { AlertCircle, CheckCircle2, ChevronRight, Download, ExternalLink, KeyRound, XCircle } from 'lucide-react'
import { useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { SkillStatusEntry } from '@/lib/gateway/types'
import { cn } from '@/lib/utils'

type Props = {
  readonly skill: SkillStatusEntry
  readonly enabled: boolean
  readonly busy: boolean
  readonly onToggle: () => void
  readonly onInstall: (installId: string) => void
  readonly onSetApiKey: (apiKey: string) => void
  readonly onExpand: () => void
}

function statusTone(skill: SkillStatusEntry, enabled: boolean) {
  if (skill.blockedByAllowlist) return 'blocked'
  const hasMissing =
    skill.missing.bins.length > 0 ||
    skill.missing.env.length > 0 ||
    skill.missing.config.length > 0 ||
    skill.missing.os.length > 0
  if (!enabled) return 'disabled'
  if (hasMissing) return 'needs-setup'
  return 'ready'
}

export function SkillCard({ skill, enabled, busy, onToggle, onInstall, onSetApiKey, onExpand }: Props) {
  const tone = statusTone(skill, enabled)
  const hasMissing = skill.missing.bins.length > 0 || skill.missing.env.length > 0 || skill.missing.config.length > 0
  const hasInstall = skill.install.length > 0 && hasMissing
  const apiKeyRef = useRef<HTMLInputElement>(null)
  const [showKey, setShowKey] = useState(false)

  const handleKeySubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const val = apiKeyRef.current?.value.trim()
    if (val) {
      onSetApiKey(val)
      if (apiKeyRef.current) apiKeyRef.current.value = ''
      setShowKey(false)
    }
  }

  return (
    <div
      className={cn(
        'group relative flex flex-col rounded-xl border p-4 transition-all duration-200',
        tone === 'ready' && 'border-primary/20 bg-card',
        tone === 'needs-setup' && 'border-amber-500/30 bg-amber-500/5',
        tone === 'blocked' && 'border-red-500/20 bg-red-500/5 opacity-80',
        tone === 'disabled' && 'border-border/40 bg-muted/10 opacity-50',
      )}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <button type="button" onClick={onToggle} disabled={busy} className="flex items-start gap-2 flex-1 text-left">
          <span className="text-2xl leading-none mt-0.5">{skill.emoji || '🔧'}</span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-foreground truncate">{skill.name}</p>
            <p className="text-[10px] text-muted-foreground/60 line-clamp-2 mt-0.5 min-h-[28px]">{skill.description}</p>
          </div>
        </button>
        <div className="flex items-center gap-1 shrink-0">
          {/* Status icon */}
          {tone === 'ready' ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          ) : tone === 'needs-setup' ? (
            <AlertCircle className="h-4 w-4 text-amber-500" />
          ) : (
            <XCircle className="h-4 w-4 text-muted-foreground/30" />
          )}
          {/* Detail expand */}
          <button
            type="button"
            onClick={onExpand}
            className="rounded p-0.5 text-muted-foreground/30 transition-colors hover:text-foreground/70"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Badges */}
      <div className="flex flex-wrap gap-1 mt-2.5">
        {tone === 'blocked' && (
          <Badge variant="outline" className="text-[9px] border-red-500/30 text-red-500">
            blocked
          </Badge>
        )}
        {tone === 'disabled' && (
          <Badge variant="outline" className="text-[9px]">
            disabled
          </Badge>
        )}
        {skill.always && (
          <Badge variant="secondary" className="text-[9px]">
            always
          </Badge>
        )}
        {skill.bundled && (
          <Badge variant="secondary" className="text-[9px]">
            built-in
          </Badge>
        )}
        {hasMissing && (
          <Badge
            variant="outline"
            className="text-[9px] border-amber-500/30 text-amber-600 dark:text-amber-400 gap-0.5"
          >
            <AlertCircle className="h-2 w-2" />
            {skill.missing.bins.length + skill.missing.env.length + skill.missing.config.length} missing
          </Badge>
        )}
        {skill.homepage && (
          <a
            href={skill.homepage}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 text-[9px] text-muted-foreground/50 hover:text-foreground/70 transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="h-2 w-2" />
          </a>
        )}
      </div>

      {/* Install options */}
      {hasInstall && (
        <div className="mt-2.5 pt-2.5 border-t border-border/30 space-y-1">
          {skill.install.map((opt) => (
            <button
              key={opt.id}
              type="button"
              disabled={busy}
              onClick={(e) => {
                e.stopPropagation()
                onInstall(opt.id)
              }}
              className="flex items-center gap-1 w-full text-[10px] text-primary hover:opacity-80 transition-opacity disabled:opacity-40"
            >
              <Download className="h-2.5 w-2.5 shrink-0" />
              Install: {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* API key input */}
      {skill.missing.env.length > 0 && (
        <div className="mt-2.5 pt-2.5 border-t border-border/30">
          {showKey ? (
            <form onSubmit={handleKeySubmit} className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <KeyRound className="absolute left-2 top-1/2 -translate-y-1/2 h-2.5 w-2.5 text-muted-foreground/40" />
                <Input
                  ref={apiKeyRef}
                  type="password"
                  placeholder={skill.missing.env[0]}
                  className="pl-6 pr-2 py-1 text-[10px] placeholder:text-muted-foreground/40"
                />
              </div>
              <Button type="submit" size="sm" variant="outline" className="h-6 text-[10px] px-2">
                Save
              </Button>
              <button
                type="button"
                onClick={() => setShowKey(false)}
                className="text-[10px] text-muted-foreground/40 hover:text-foreground"
              >
                Cancel
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setShowKey(true)}
              className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 hover:opacity-80 transition-opacity"
            >
              <KeyRound className="h-2.5 w-2.5" />
              Set API key ({skill.missing.env[0]})
            </button>
          )}
        </div>
      )}

      {/* Missing config hint */}
      {skill.missing.config.length > 0 && (
        <p className="mt-1.5 text-[9px] text-orange-500/70 truncate">
          Missing config: {skill.missing.config.join(', ')}
        </p>
      )}
    </div>
  )
}
