import { Plus, Radio } from 'lucide-react'
import { useState } from 'react'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { selectClient, useGatewayStore } from '@/stores/gateway-store'
import { ChannelCard } from './components/channel-card'
import { DeviceManagement } from './components/device-management'
import { DmPairingQueue } from './components/dm-pairing-queue'
import { SetupWizard } from './components/setup-wizard'
import { useChannels } from './hooks/use-channels'
import { usePairing } from './hooks/use-pairing'

export default function ChannelsPage() {
  const client = useGatewayStore(selectClient)
  const { channels, refresh: refreshChannels } = useChannels()
  const { pending, paired, busy, refresh: refreshPairing, approve, reject, remove } = usePairing()
  const [wizardOpen, setWizardOpen] = useState(false)

  const channelOrder = channels?.channelOrder ?? []
  const channelLabels = channels?.channelLabels ?? {}
  const channelAccounts = channels?.channelAccounts ?? {}

  const refreshAll = () => {
    refreshChannels()
    refreshPairing()
  }

  return (
    <main className="flex-1 space-y-4 p-3 sm:space-y-6 sm:p-6">
      <div className="flex items-center justify-between">
        <PageHeader
          icon={Radio}
          title="Channels"
          description="Manage messaging channels, device pairing, and DM approvals."
          badge={`${channelOrder.length} channels`}
        />
        <Button size="sm" className="gap-1.5" onClick={() => setWizardOpen(true)}>
          <Plus className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Add Channel</span>
        </Button>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {channelOrder.map((id) => (
          <ChannelCard
            key={id}
            channelId={id}
            label={channelLabels[id] ?? id}
            accounts={channelAccounts[id] ?? []}
            client={client}
            onRefresh={refreshAll}
          />
        ))}
      </section>

      {channelOrder.length === 0 && (
        <div className="py-12 text-center text-sm text-muted-foreground">No channels configured</div>
      )}

      <Separator className="opacity-30" />

      <DeviceManagement
        pending={pending}
        paired={paired}
        busy={busy}
        client={client}
        onApprove={approve}
        onReject={reject}
        onRemove={remove}
        onRefresh={refreshAll}
      />

      <DmPairingQueue client={client} onRefresh={refreshAll} />

      <SetupWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        channelOrder={channelOrder}
        channelLabels={channelLabels}
        channelAccounts={channelAccounts}
        client={client}
        onRefresh={refreshAll}
      />
    </main>
  )
}
