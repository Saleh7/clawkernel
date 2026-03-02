import { ArrowRight, Cable, Hash, Link2, Pencil, Plus, Save, Shield, Timer, Trash2, Unlink, Users } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import type { GatewayClient } from '@/lib/gateway/client'
import type { ConfigSnapshot } from '@/lib/gateway/types'
import { createLogger } from '@/lib/logger'
import { useGatewayStore } from '@/stores/gateway-store'
import { saveRawConfigWithRetry } from '../config-utils'
import { AgentStatPill } from './agent-stat-pill'
import { AgentTabEmptyState } from './agent-tab-empty-state'

const log = createLogger('agents:bindings')

// ---------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------

type AgentBinding = {
  agentId: string
  match: {
    channel: string
    accountId?: string
    peer?: { kind: string; id: string }
    guildId?: string
    teamId?: string
    roles?: string[]
  }
}

type Props = {
  agentId: string
  config: ConfigSnapshot | null
  isDefault: boolean
  client: GatewayClient | null
}

type BindingDraft = {
  channel: string
  accountId: string
  peerKind: string
  peerId: string
  guildId: string
  teamId: string
  roles: string
}

const EMPTY_DRAFT: BindingDraft = {
  channel: '',
  accountId: '',
  peerKind: 'direct',
  peerId: '',
  guildId: '',
  teamId: '',
  roles: '',
}

const CHANNEL_OPTIONS = [
  'telegram',
  'discord',
  'slack',
  'whatsapp',
  'webchat',
  'signal',
  'irc',
  'googlechat',
  'imessage',
]
const PEER_KINDS = ['direct', 'group']

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

function bindingToString(b: AgentBinding): string {
  const parts: string[] = [b.match.channel]
  if (b.match.accountId) parts.push(`account:${b.match.accountId}`)
  if (b.match.peer) parts.push(`${b.match.peer.kind}:${b.match.peer.id}`)
  if (b.match.guildId) parts.push(`guild:${b.match.guildId}`)
  if (b.match.teamId) parts.push(`team:${b.match.teamId}`)
  if (b.match.roles?.length) parts.push(`roles:${b.match.roles.join(',')}`)
  return parts.join(' → ')
}

function bindingToDraft(b: AgentBinding): BindingDraft {
  return {
    channel: b.match.channel || '',
    accountId: b.match.accountId || '',
    peerKind: b.match.peer?.kind || 'direct',
    peerId: b.match.peer?.id || '',
    guildId: b.match.guildId || '',
    teamId: b.match.teamId || '',
    roles: b.match.roles?.join(', ') || '',
  }
}

function draftToBinding(agentId: string, draft: BindingDraft): AgentBinding {
  const match: AgentBinding['match'] = { channel: draft.channel.trim().toLowerCase() }
  if (draft.accountId.trim()) match.accountId = draft.accountId.trim()
  if (draft.peerId.trim()) match.peer = { kind: draft.peerKind, id: draft.peerId.trim() }
  if (draft.guildId.trim()) match.guildId = draft.guildId.trim()
  if (draft.teamId.trim()) match.teamId = draft.teamId.trim()
  const roles = draft.roles
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean)
  if (roles.length) match.roles = roles
  return { agentId, match }
}

// ---------------------------------------------------------------------------
//  BindingCard
// ---------------------------------------------------------------------------

function BindingCard({
  binding,
  onEdit,
  onDelete,
}: {
  binding: AgentBinding
  index: number
  onEdit: () => void
  onDelete: () => void
}) {
  const m = binding.match
  return (
    <div className="group rounded-xl border border-border/40 bg-background/50 p-4 transition-all hover:border-primary/20">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Cable className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="rounded-full px-2 py-0 text-[10px] font-semibold uppercase">
                {m.channel}
              </Badge>
              {m.accountId && (
                <>
                  <ArrowRight className="h-3 w-3 text-muted-foreground/40" />
                  <Badge variant="secondary" className="rounded-full px-2 py-0 text-[10px] font-mono">
                    {m.accountId}
                  </Badge>
                </>
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {m.peer && (
                <span className="flex items-center gap-1 rounded-md border border-border/30 bg-muted/20 px-2 py-0.5 text-[10px] text-muted-foreground">
                  <Users className="h-3 w-3" />
                  {m.peer.kind}:{m.peer.id}
                </span>
              )}
              {m.guildId && (
                <span className="flex items-center gap-1 rounded-md border border-border/30 bg-muted/20 px-2 py-0.5 text-[10px] text-muted-foreground">
                  <Hash className="h-3 w-3" />
                  guild:{m.guildId}
                </span>
              )}
              {m.teamId && (
                <span className="flex items-center gap-1 rounded-md border border-border/30 bg-muted/20 px-2 py-0.5 text-[10px] text-muted-foreground">
                  <Hash className="h-3 w-3" />
                  team:{m.teamId}
                </span>
              )}
              {m.roles?.map((r) => (
                <span
                  key={r}
                  className="flex items-center gap-1 rounded-md border border-border/30 bg-muted/20 px-2 py-0.5 text-[10px] text-muted-foreground"
                >
                  <Shield className="h-3 w-3" />
                  {r}
                </span>
              ))}
              {!m.peer && !m.guildId && !m.teamId && !m.roles?.length && !m.accountId && (
                <span className="text-[10px] text-muted-foreground/50">catches all traffic on {m.channel}</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onEdit}>
            <Pencil className="h-3 w-3" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
//  BindingFormDialog
// ---------------------------------------------------------------------------

function BindingFormDialog({
  open,
  onOpenChange,
  mode,
  draft,
  setDraft,
  onSave,
  saving,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  mode: 'create' | 'edit'
  draft: BindingDraft
  setDraft: (d: BindingDraft) => void
  onSave: () => void
  saving: boolean
}) {
  const update = (key: keyof BindingDraft, value: string) => setDraft({ ...draft, [key]: value })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Cable className="h-4 w-4 text-primary" />
            {mode === 'create' ? 'Add Binding' : 'Edit Binding'}
          </DialogTitle>
          <DialogDescription className="text-xs">Route messages from a channel to this agent</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Channel */}
          <div className="space-y-1.5">
            <Label className="text-xs">Channel *</Label>
            <div className="relative">
              <select
                value={draft.channel}
                onChange={(e) => update('channel', e.target.value)}
                className="w-full appearance-none rounded-lg border border-border bg-background px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
              >
                <option value="">Select channel...</option>
                {CHANNEL_OPTIONS.map((ch) => (
                  <option key={ch} value={ch}>
                    {ch}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Account ID */}
          <div className="space-y-1.5">
            <Label className="text-xs">Account ID</Label>
            <Input
              value={draft.accountId}
              onChange={(e) => update('accountId', e.target.value)}
              placeholder="Optional — specific bot account"
              className="text-sm"
            />
          </div>

          {/* Peer */}
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Peer Kind</Label>
              <select
                value={draft.peerKind}
                onChange={(e) => update('peerKind', e.target.value)}
                className="w-full appearance-none rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
              >
                {PEER_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs">Peer ID</Label>
              <Input
                value={draft.peerId}
                onChange={(e) => update('peerId', e.target.value)}
                placeholder="Chat/group ID"
                className="text-sm"
              />
            </div>
          </div>

          {/* Guild / Team */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Guild ID</Label>
              <Input
                value={draft.guildId}
                onChange={(e) => update('guildId', e.target.value)}
                placeholder="Discord guild"
                className="text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Team ID</Label>
              <Input
                value={draft.teamId}
                onChange={(e) => update('teamId', e.target.value)}
                placeholder="Slack team"
                className="text-sm"
              />
            </div>
          </div>

          {/* Roles */}
          <div className="space-y-1.5">
            <Label className="text-xs">Roles</Label>
            <Input
              value={draft.roles}
              onChange={(e) => update('roles', e.target.value)}
              placeholder="Comma-separated Discord role IDs"
              className="text-sm"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" disabled={!draft.channel.trim() || saving} onClick={onSave} className="gap-1.5">
            {saving ? <Timer className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            {mode === 'create' ? 'Add Binding' : 'Save Changes'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
//  AgentBindings — main export
// ---------------------------------------------------------------------------

export function AgentBindings({ agentId, config, isDefault, client }: Props) {
  const [createOpen, setCreateOpen] = useState(false)
  const [editIndex, setEditIndex] = useState<number | null>(null)
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null)
  const [draft, setDraft] = useState<BindingDraft>(EMPTY_DRAFT)
  const [saving, setSaving] = useState(false)

  const allBindings = useMemo(() => {
    const cfg = config?.config as Record<string, unknown> | null | undefined
    return (cfg?.bindings ?? []) as AgentBinding[]
  }, [config])

  const agentBindingsWithIndex = useMemo(() => {
    const result: { binding: AgentBinding; globalIndex: number }[] = []
    allBindings.forEach((b, i) => {
      if (b?.agentId === agentId) result.push({ binding: b, globalIndex: i })
    })
    return result
  }, [allBindings, agentId])

  const otherAgentBindings = useMemo(() => {
    return allBindings.filter((b) => b?.agentId && b.agentId !== agentId)
  }, [allBindings, agentId])

  const saveBindings = useCallback(
    async (newAllBindings: AgentBinding[]) => {
      if (!client?.connected || !config) return
      setSaving(true)
      try {
        const fresh = await saveRawConfigWithRetry(client, config, (current) => ({
          ...current,
          bindings: newAllBindings,
        }))
        useGatewayStore.getState().setConfig(fresh)
      } catch (err) {
        log.error('Failed to save bindings', err)
        toast.error('Failed to save binding configuration')
        throw err
      } finally {
        setSaving(false)
      }
    },
    [client, config],
  )

  const handleCreate = useCallback(() => {
    const newBinding = draftToBinding(agentId, draft)
    const newAll = [...allBindings, newBinding]
    void saveBindings(newAll)
      .then(() => {
        setCreateOpen(false)
        setDraft(EMPTY_DRAFT)
      })
      .catch(() => {})
  }, [agentId, draft, allBindings, saveBindings])

  const handleEdit = useCallback(() => {
    if (editIndex === null) return
    const entry = agentBindingsWithIndex[editIndex]
    if (!entry) return
    const newBinding = draftToBinding(agentId, draft)
    const newAll = [...allBindings]
    newAll[entry.globalIndex] = newBinding
    void saveBindings(newAll)
      .then(() => {
        setEditIndex(null)
        setDraft(EMPTY_DRAFT)
      })
      .catch(() => {})
  }, [agentId, editIndex, draft, agentBindingsWithIndex, allBindings, saveBindings])

  const handleDelete = useCallback(() => {
    if (deleteIndex === null) return
    const entry = agentBindingsWithIndex[deleteIndex]
    if (!entry) return
    const newAll = allBindings.filter((_, i) => i !== entry.globalIndex)
    void saveBindings(newAll)
      .then(() => setDeleteIndex(null))
      .catch(() => {})
  }, [deleteIndex, agentBindingsWithIndex, allBindings, saveBindings])

  const openEdit = (localIdx: number) => {
    const entry = agentBindingsWithIndex[localIdx]
    if (!entry) return
    setDraft(bindingToDraft(entry.binding))
    setEditIndex(localIdx)
  }

  const openCreate = () => {
    setDraft(EMPTY_DRAFT)
    setCreateOpen(true)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <AgentStatPill
            icon={Link2}
            value={agentBindingsWithIndex.length}
            label="bindings"
            iconClassName="text-primary"
          />
          {isDefault && (
            <Badge variant="secondary" className="rounded-full text-[10px]">
              Default agent — receives unbound traffic
            </Badge>
          )}
        </div>
        <Button size="sm" className="gap-1.5 rounded-full text-xs" onClick={openCreate}>
          <Plus className="h-3.5 w-3.5" />
          Add Binding
        </Button>
      </div>

      {/* Bindings list */}
      {agentBindingsWithIndex.length === 0 ? (
        <AgentTabEmptyState
          icon={Unlink}
          title={
            isDefault
              ? 'No explicit bindings — receives all unbound traffic as default agent'
              : 'No bindings configured for this agent'
          }
          action={
            <Button size="sm" variant="outline" className="gap-1.5 rounded-full" onClick={openCreate}>
              <Plus className="h-3.5 w-3.5" />
              Add First Binding
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {agentBindingsWithIndex.map(({ binding }, localIdx) => (
            <BindingCard
              key={localIdx}
              binding={binding}
              index={localIdx}
              onEdit={() => openEdit(localIdx)}
              onDelete={() => setDeleteIndex(localIdx)}
            />
          ))}
        </div>
      )}

      {/* Other agents' bindings for context */}
      {otherAgentBindings.length > 0 && (
        <div className="space-y-2">
          <Separator className="opacity-30" />
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/40">
            Other Agents' Bindings ({otherAgentBindings.length})
          </p>
          <div className="space-y-1.5">
            {otherAgentBindings.map((b, i) => (
              <div
                key={i}
                className="flex items-center gap-2 rounded-lg border border-border/20 bg-muted/10 px-3 py-2 text-[10px] text-muted-foreground/50"
              >
                <Badge variant="outline" className="rounded-full px-1.5 py-0 text-[9px]">
                  {b.agentId}
                </Badge>
                <ArrowRight className="h-2.5 w-2.5" />
                <span className="font-mono">{bindingToString(b)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create Dialog */}
      <BindingFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode="create"
        draft={draft}
        setDraft={setDraft}
        onSave={handleCreate}
        saving={saving}
      />

      {/* Edit Dialog */}
      <BindingFormDialog
        open={editIndex !== null}
        onOpenChange={(o) => {
          if (!o) setEditIndex(null)
        }}
        mode="edit"
        draft={draft}
        setDraft={setDraft}
        onSave={handleEdit}
        saving={saving}
      />

      {/* Delete Confirm */}
      <ConfirmDialog
        open={deleteIndex !== null}
        onOpenChange={(o) => {
          if (!o) setDeleteIndex(null)
        }}
        title="Remove Binding"
        titleIcon={<Trash2 className="h-4 w-4 text-destructive" />}
        description={
          <>
            {deleteIndex !== null && agentBindingsWithIndex[deleteIndex] && (
              <span className="block font-mono text-[11px] rounded-md border border-border/50 bg-muted/30 px-2 py-1.5 mt-1">
                {bindingToString(agentBindingsWithIndex[deleteIndex].binding)}
              </span>
            )}
            <span className="block mt-2">This binding will be removed from the config.</span>
          </>
        }
        actionLabel="Remove Binding"
        loadingLabel="Removing…"
        loading={saving}
        onConfirm={handleDelete}
      />
    </div>
  )
}
