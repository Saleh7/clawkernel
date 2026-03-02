import { Globe, RefreshCw } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { BrowserRequestPanel } from './components/browser-request-panel'
import { BrowserStatusCard } from './components/browser-status-card'
import { useBrowser } from './hooks/use-browser'

export default function BrowserPage() {
  const { status, probeLoading, disabled, probeError, sending, lastResult, history, probe, sendRequest } = useBrowser()

  return (
    <div className="flex flex-col gap-8 p-6">
      <PageHeader
        icon={Globe}
        title="Browser"
        description="Probe browser control status and send browser.request calls to the Gateway"
      >
        <Button size="sm" variant="outline" onClick={() => void probe()} disabled={probeLoading} className="gap-1.5">
          <RefreshCw className={cn('h-3.5 w-3.5', probeLoading && 'animate-spin')} />
          Refresh
        </Button>
      </PageHeader>

      <div className="flex flex-col gap-4">
        <BrowserStatusCard status={status} loading={probeLoading} disabled={disabled} error={probeError} />

        {!disabled && (
          <BrowserRequestPanel sending={sending} lastResult={lastResult} history={history} onSend={sendRequest} />
        )}
      </div>
    </div>
  )
}
