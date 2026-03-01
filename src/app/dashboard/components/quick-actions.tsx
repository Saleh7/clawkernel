import { MessageSquare } from 'lucide-react'
import { useNavigate } from 'react-router'
import { CreateAgentDialog } from '@/app/agents/dialogs/create-agent-dialog'
import { Button } from '@/components/ui/button'
import { selectClient, useGatewayStore } from '@/stores/gateway-store'

export function QuickActions() {
  const navigate = useNavigate()
  const client = useGatewayStore(selectClient)

  return (
    <div className="flex items-center gap-2">
      <CreateAgentDialog client={client} />
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate('/chat')}>
        <MessageSquare className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Open Chat</span>
      </Button>
    </div>
  )
}
