import { AlertTriangle, Shield, Users, Wifi, WifiOff } from 'lucide-react'
import { useMemo } from 'react'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useTime } from '@/hooks/use-time'
import { selectIsConnected, selectPresence, selectScopeError, useGatewayStore } from '@/stores/gateway-store'

export function StatusBar() {
  const now = useTime()
  const connected = useGatewayStore(selectIsConnected)
  const scopeError = useGatewayStore(selectScopeError)
  const presence = useGatewayStore(selectPresence)

  const presenceEntries = useMemo(() => {
    return Object.entries(presence).map(([id, entry]) => ({
      id,
      label: entry.host || entry.instanceId || id,
      mode: entry.mode || 'unknown',
      platform: entry.platform,
    }))
  }, [presence])
  const presenceCount = presenceEntries.length

  const time = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const date = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border/50 bg-background/80 px-3 py-2 backdrop-blur-md transition-colors duration-300 sm:px-4 sm:py-2.5">
        <div className="flex items-center gap-2 sm:gap-3">
          <SidebarTrigger className="-ml-1" />
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="hidden items-center gap-3 text-xs text-muted-foreground sm:flex">
            {presenceCount > 0 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex cursor-default items-center gap-1">
                      <Users className="h-3 w-3 text-primary" />
                      <span>{presenceCount}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <div className="space-y-1 text-xs">
                      <div className="font-medium">Connected clients</div>
                      {presenceEntries.map((e) => (
                        <div key={e.id} className="flex items-center gap-2">
                          <span className="font-mono text-[10px]">{e.label}</span>
                          <span className="text-[10px] text-muted-foreground">{e.mode}</span>
                        </div>
                      ))}
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            <div className="flex items-center gap-1">
              <Shield className="h-3 w-3 text-success" />
              <span>Secure</span>
            </div>
            <div className="flex items-center gap-1">
              {connected ? <Wifi className="h-3 w-3 text-success" /> : <WifiOff className="h-3 w-3 text-destructive" />}
              <span>{connected ? 'Connected' : 'Offline'}</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:hidden">
            {connected ? (
              <Wifi className="h-3 w-3 text-success" />
            ) : (
              <WifiOff className="h-3 w-3 text-destructive animate-pulse" />
            )}
          </div>
          <div className="text-right">
            <div className="font-mono text-xs font-bold tracking-tight sm:text-sm">{time}</div>
            <div className="text-[9px] text-muted-foreground sm:text-[10px]">{date}</div>
          </div>
        </div>
      </header>
      {scopeError && (
        <div className="flex items-center gap-2 border-b border-destructive/20 bg-destructive/10 px-4 py-2 text-xs text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>{scopeError}</span>
        </div>
      )}
    </>
  )
}
