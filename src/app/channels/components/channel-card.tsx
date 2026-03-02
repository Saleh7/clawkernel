import { LogOut, Power, Settings } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { patchConfigWithRetry } from '@/app/agents/config-utils'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { GatewayClient } from '@/lib/gateway/client'
import type { ChannelAccountSnapshot, ConfigSnapshot } from '@/lib/gateway/types'
import { createLogger } from '@/lib/logger'
import { cn } from '@/lib/utils'
import { useGatewayStore } from '@/stores/gateway-store'
import { CHANNEL_ICONS, CHANNEL_SETUP_TYPE } from '../types'
import { ChannelSettings } from './channel-settings'
import { QrLoginDialog } from './qr-login-dialog'
import { TokenSetup } from './token-setup'

const log = createLogger('channel-card')

type Props = {
  channelId: string
  label: string
  accounts: ChannelAccountSnapshot[]
  client: GatewayClient | null
  onRefresh: () => void
}

function accountStatus(a: ChannelAccountSnapshot): 'connected' | 'partial' | 'offline' {
  if (a.connected) return 'connected'
  if (a.running) return 'partial'
  return 'offline'
}

const STATUS_DOT: Record<string, string> = {
  connected: 'bg-success',
  partial: 'bg-warning',
  offline: 'bg-destructive',
}

const STATUS_LABEL: Record<string, string> = {
  connected: 'Connected',
  partial: 'Starting',
  offline: 'Offline',
}

export function ChannelCard({ channelId, label, accounts, client, onRefresh }: Props) {
  const config = useGatewayStore((s) => s.config)
  const [showSettings, setShowSettings] = useState(false)
  const [showLogout, setShowLogout] = useState(false)
  const [showToggle, setShowToggle] = useState(false)
  const [logoutBusy, setLogoutBusy] = useState(false)
  const [toggleBusy, setToggleBusy] = useState(false)

  const icon = CHANNEL_ICONS[channelId] ?? '📡'
  const setupType = CHANNEL_SETUP_TYPE[channelId]
  const isConfigured = accounts.some((a) => a.configured)
  const isEnabled = accounts.some((a) => a.enabled !== false)
  const connectedCount = accounts.filter((a) => a.connected).length
  const bestStatus = accounts.some((a) => a.connected)
    ? 'connected'
    : accounts.some((a) => a.running)
      ? 'partial'
      : 'offline'

  const handleToggleEnabled = async () => {
    if (!client?.connected || !config) return
    setToggleBusy(true)
    const next = !isEnabled
    try {
      const channelPatch: Record<string, unknown> = { enabled: next }
      for (const a of accounts) {
        if (a.accountId) {
          channelPatch.accounts = {
            ...((channelPatch.accounts as Record<string, unknown>) ?? {}),
            [a.accountId]: { enabled: next },
          }
        }
      }
      const patch = { channels: { [channelId]: channelPatch } }
      await patchConfigWithRetry(client, config, JSON.stringify(patch), 2000)
      setShowToggle(false)
      toast.success(`${label} ${next ? 'enabled' : 'disabled'} — gateway restarting…`, { duration: 4000 })
      const freshConfig = await client.request<ConfigSnapshot>('config.get', {})
      useGatewayStore.getState().setConfig(freshConfig)
      await new Promise((r) => setTimeout(r, 2500))
      onRefresh()
    } catch (err) {
      toast.error('Toggle failed')
      log.error('Enable/disable failed', err)
    } finally {
      setToggleBusy(false)
    }
  }

  const handleLogout = async () => {
    if (!client?.connected) return
    setLogoutBusy(true)
    try {
      await client.request('channels.logout', { channel: channelId })
      toast.success(`${label} logged out`)
      onRefresh()
    } catch (err) {
      toast.error('Logout failed')
      log.error('Channel logout failed', err)
    } finally {
      setLogoutBusy(false)
      setShowLogout(false)
    }
  }

  return (
    <>
      <Card className={cn('border-border/50 bg-card/50 backdrop-blur-sm', !isEnabled && 'opacity-60')}>
        <CardHeader className="flex flex-row items-center gap-3 px-4 pb-2 pt-4">
          <span className="text-xl">{icon}</span>
          <div className="min-w-0 flex-1">
            <CardTitle className="text-sm font-semibold">{label}</CardTitle>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <span className={cn('h-2 w-2 rounded-full', STATUS_DOT[bestStatus])} />
              <span>{STATUS_LABEL[bestStatus]}</span>
              {!isConfigured && <span>· Not configured</span>}
              {!isEnabled && isConfigured && <span>· Disabled</span>}
              {accounts.length > 1 && (
                <span>
                  · {connectedCount}/{accounts.length} accounts
                </span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 gap-1">
            {isConfigured && (
              <Button
                variant="ghost"
                size="icon"
                className={cn('h-7 w-7', isEnabled ? 'text-success' : 'text-muted-foreground')}
                title={isEnabled ? 'Disable' : 'Enable'}
                disabled={toggleBusy}
                onClick={() => setShowToggle(true)}
              >
                <Power className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title="Settings"
              onClick={() => setShowSettings((v) => !v)}
            >
              <Settings className="h-3.5 w-3.5" />
            </Button>
            {bestStatus === 'connected' && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive"
                title="Logout"
                onClick={() => setShowLogout(true)}
              >
                <LogOut className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="flex flex-wrap gap-1">
            {accounts.map((a) => {
              const s = accountStatus(a)
              return (
                <Badge
                  key={a.accountId}
                  variant="outline"
                  className={cn(
                    'text-[10px]',
                    s === 'connected' && 'border-success/20 bg-success/10 text-success',
                    s === 'partial' && 'border-warning/20 bg-warning/10 text-warning',
                    s === 'offline' && 'border-destructive/20 bg-destructive/10 text-destructive',
                  )}
                >
                  {a.name ?? a.accountId}
                </Badge>
              )
            })}
          </div>

          {accounts.some((a) => a.lastError) && (
            <div className="mt-2 truncate text-[10px] text-destructive">
              {accounts.find((a) => a.lastError)?.lastError}
            </div>
          )}

          {showSettings && (
            <div className="mt-3 space-y-3 border-t border-border/50 pt-3">
              <ChannelSettings channelId={channelId} client={client} onRefresh={onRefresh} />
              {setupType === 'token' && (
                <TokenSetup channelId={channelId} label={label} client={client} onRefresh={onRefresh} />
              )}
              {setupType === 'qr' && <QrLoginDialog label={label} client={client} onRefresh={onRefresh} />}
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={showToggle}
        onOpenChange={setShowToggle}
        title={`${isEnabled ? 'Disable' : 'Enable'} ${label}`}
        description={
          isEnabled
            ? `This will disable ${label} and restart the gateway. The channel will stop receiving messages.`
            : `This will enable ${label} and restart the gateway. The channel will start receiving messages.`
        }
        actionLabel={isEnabled ? 'Disable' : 'Enable'}
        variant={isEnabled ? 'destructive' : 'default'}
        loading={toggleBusy}
        onConfirm={() => void handleToggleEnabled()}
      />

      <ConfirmDialog
        open={showLogout}
        onOpenChange={setShowLogout}
        title={`Logout ${label}`}
        description={`This will disconnect ${label} and clear its session. You may need to re-authenticate.`}
        actionLabel="Logout"
        variant="destructive"
        loading={logoutBusy}
        onConfirm={() => void handleLogout()}
      />
    </>
  )
}
