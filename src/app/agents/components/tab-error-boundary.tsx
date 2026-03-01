import { AlertCircle, RefreshCw } from 'lucide-react'
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { createLogger } from '@/lib/logger'

const log = createLogger('agents:tab-error')

type Props = { tab: string; children: ReactNode }
type State = { error: Error | null }

export class TabErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    log.error(`Tab "${this.props.tab}" crashed`, error, { stack: info.componentStack ?? '' })
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 py-16">
          <AlertCircle className="h-8 w-8 text-destructive/40" />
          <div className="text-center space-y-1">
            <p className="text-sm font-medium text-destructive">This tab encountered an error</p>
            <p className="text-xs text-muted-foreground font-mono">{this.state.error.message}</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => this.setState({ error: null })} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </Button>
        </div>
      )
    }
    return this.props.children
  }
}
