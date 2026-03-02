import {
  AlertCircle,
  Check,
  Ghost,
  ImageIcon,
  Palette,
  Pencil,
  RefreshCw,
  Save,
  Smile,
  Sparkles,
  User,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import type { GatewayClient } from '@/lib/gateway/client'
import type { AgentFileEntry, AgentIdentityResult } from '@/lib/gateway/types'
import { createLogger } from '@/lib/logger'
import { cn } from '@/lib/utils'

const log = createLogger('agents:identity')

// ---------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------

type Props = {
  agentId: string
  identity?: AgentIdentityResult | null
  client: GatewayClient | null
  onSaved?: (identity: IdentityFields) => void
}

type IdentityFields = {
  name: string
  emoji: string
  creature: string
  vibe: string
  avatar: string
  theme: string
}

const EMPTY_FIELDS: IdentityFields = {
  name: '',
  emoji: '',
  creature: '',
  vibe: '',
  avatar: '',
  theme: '',
}

// ---------------------------------------------------------------------------
//  Parse / serialize IDENTITY.md
// ---------------------------------------------------------------------------

function parseIdentityMd(content: string): IdentityFields {
  const fields = { ...EMPTY_FIELDS }
  for (const line of content.split(/\r?\n/)) {
    const cleaned = line.trim().replace(/^\s*-\s*/, '')
    const colonIdx = cleaned.indexOf(':')
    if (colonIdx === -1) continue
    const label = cleaned.slice(0, colonIdx).replace(/[*_]/g, '').trim().toLowerCase()
    const value = cleaned
      .slice(colonIdx + 1)
      .replace(/^[*_]+|[*_]+$/g, '')
      .trim()
    if (!value) continue
    if (label === 'name') fields.name = value
    if (label === 'emoji') fields.emoji = value
    if (label === 'creature') fields.creature = value
    if (label === 'vibe') fields.vibe = value
    if (label === 'avatar') fields.avatar = value
    if (label === 'theme') fields.theme = value
  }
  return fields
}

function serializeIdentityMd(fields: IdentityFields): string {
  const lines = ['# IDENTITY.md', '']
  const entries: [string, string][] = [
    ['Name', fields.name],
    ['Creature', fields.creature],
    ['Vibe', fields.vibe],
    ['Emoji', fields.emoji],
    ['Avatar', fields.avatar],
    ['Theme', fields.theme],
  ]
  for (const [key, value] of entries) {
    lines.push(`- **${key}:** ${value}`)
  }
  lines.push('')
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
//  Field config
// ---------------------------------------------------------------------------

const FIELD_CONFIG: {
  key: keyof IdentityFields
  label: string
  icon: typeof User
  placeholder: string
  description: string
}[] = [
  {
    key: 'name',
    label: 'Name',
    icon: User,
    placeholder: 'Canvas',
    description: 'Display name shown in chat and dashboards',
  },
  {
    key: 'emoji',
    label: 'Emoji',
    icon: Smile,
    placeholder: '🎨',
    description: 'Single emoji shown as avatar fallback',
  },
  {
    key: 'creature',
    label: 'Creature',
    icon: Ghost,
    placeholder: 'AI assistant',
    description: 'What kind of entity is this agent?',
  },
  {
    key: 'vibe',
    label: 'Vibe',
    icon: Sparkles,
    placeholder: 'Calm, direct, no fluff',
    description: 'Personality and communication style',
  },
  {
    key: 'avatar',
    label: 'Avatar',
    icon: ImageIcon,
    placeholder: 'https://... or path or data URI',
    description: 'URL, workspace path, or data URI for avatar image',
  },
  {
    key: 'theme',
    label: 'Theme',
    icon: Palette,
    placeholder: '',
    description: 'Optional theme name for styling',
  },
]

// ---------------------------------------------------------------------------
//  Preview component
// ---------------------------------------------------------------------------

function IdentityPreview({ fields }: { fields: IdentityFields }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/40 bg-background/50 p-3">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border/40 bg-muted/30 text-xl">
        {fields.emoji || fields.name?.slice(0, 1) || '?'}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{fields.name || 'Unnamed Agent'}</p>
        <p className="truncate text-[11px] text-muted-foreground">
          {[fields.creature, fields.vibe].filter(Boolean).join(' · ') || 'No description'}
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
//  EditIdentityDialog
// ---------------------------------------------------------------------------

export function EditIdentityDialog({ agentId, identity, client, onSaved }: Props) {
  const [open, setOpen] = useState(false)
  const [fields, setFields] = useState<IdentityFields>(EMPTY_FIELDS)
  const [original, setOriginal] = useState<IdentityFields>(EMPTY_FIELDS)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!open || !client?.connected) return
    setLoading(true)
    setError(null)
    setSaved(false)

    client
      .request<{ agentId: string; workspace: string; files: AgentFileEntry[] }>('agents.files.list', { agentId })
      .then((r) => {
        const identityFile = r.files.find((f) => f.name === 'IDENTITY.md')
        if (identityFile?.content) {
          const parsed = parseIdentityMd(identityFile.content)
          setFields(parsed)
          setOriginal(parsed)
        } else {
          const prefill: IdentityFields = {
            ...EMPTY_FIELDS,
            name: identity?.name || '',
            emoji: identity?.emoji || '',
          }
          setFields(prefill)
          setOriginal(prefill)
        }
      })
      .catch(() => {
        const prefill: IdentityFields = {
          ...EMPTY_FIELDS,
          name: identity?.name || '',
          emoji: identity?.emoji || '',
        }
        setFields(prefill)
        setOriginal(prefill)
      })
      .finally(() => setLoading(false))
  }, [open, agentId, client, identity])

  const isDirty = Object.keys(EMPTY_FIELDS).some(
    (k) => fields[k as keyof IdentityFields] !== original[k as keyof IdentityFields],
  )

  const updateField = useCallback((key: keyof IdentityFields, value: string) => {
    setFields((prev) => ({ ...prev, [key]: value }))
    setSaved(false)
  }, [])

  const handleSave = useCallback(async () => {
    if (!client?.connected || !isDirty) return
    setSaving(true)
    setError(null)

    try {
      const content = serializeIdentityMd(fields)
      await client.request('agents.files.set', {
        agentId,
        name: 'IDENTITY.md',
        content,
      })

      setOriginal({ ...fields })
      setSaved(true)
      onSaved?.(fields)

      client
        .request<AgentIdentityResult>('agent.identity.get', { agentId })
        .catch((err) => log.warn('Identity refresh failed', err))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    }
    setSaving(false)
  }, [client, agentId, fields, isDirty, onSaved])

  const handleReset = useCallback(() => {
    setFields({ ...original })
    setSaved(false)
    setError(null)
  }, [original])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 rounded-lg text-xs">
          <Pencil className="h-3 w-3" />
          Edit Identity
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Pencil className="h-4 w-4 text-primary" />
            Edit Identity
          </DialogTitle>
          <DialogDescription className="text-xs">
            Modify <span className="font-mono">IDENTITY.md</span> for agent{' '}
            <span className="font-mono font-semibold">{agentId}</span>
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-3 py-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-muted/30" />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Live preview */}
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Preview</p>
              <IdentityPreview fields={fields} />
            </div>

            <Separator className="opacity-40" />

            {/* Fields */}
            <div className="space-y-3">
              {FIELD_CONFIG.map(({ key, label, icon: Icon, placeholder, description }) => (
                <div key={key} className="space-y-1">
                  <Label className="flex items-center gap-1.5 text-xs">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    {label}
                  </Label>
                  <Input
                    value={fields[key]}
                    onChange={(e) => updateField(key, e.target.value)}
                    placeholder={placeholder}
                    className={cn('text-sm', key === 'emoji' && 'font-mono text-lg w-20')}
                  />
                  <p className="text-[10px] text-muted-foreground/50">{description}</p>
                </div>
              ))}
            </div>

            {/* Status */}
            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {error}
              </div>
            )}
            {saved && !isDirty && (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-400">
                <Check className="h-3.5 w-3.5 shrink-0" />
                Identity saved successfully
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2">
                {isDirty && (
                  <Badge variant="outline" className="text-[9px] border-amber-500/30 text-amber-500">
                    unsaved changes
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={handleReset} disabled={!isDirty} className="h-7 text-xs">
                  Reset
                </Button>
                <Button
                  size="sm"
                  onClick={() => void handleSave()}
                  disabled={!isDirty || saving}
                  className="h-7 gap-1.5 text-xs"
                >
                  {saving ? (
                    <>
                      <RefreshCw className="h-3 w-3 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    <>
                      <Save className="h-3 w-3" />
                      Save Identity
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
