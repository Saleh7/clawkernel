import type { GatewayClient } from '@/lib/gateway/client'
import { selectClient, useGatewayStore } from '@/stores/gateway-store'

/**
 * Resolves the gateway client for session dialogs.
 * Uses the explicitly-passed client if provided, otherwise falls back to the store client.
 */
export function useSessionDialogClient(clientProp?: GatewayClient | null): GatewayClient | null {
  const storeClient = useGatewayStore(selectClient)
  return clientProp === undefined ? storeClient : clientProp
}
