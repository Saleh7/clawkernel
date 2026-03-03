import { create } from 'zustand'

interface RestartBarState {
  isVisible: boolean
  show: () => void
  hide: () => void
}

/**
 * Controls the "Restart Gateway" announcement bar.
 * Call show() after a config change that requires a manual gateway restart.
 * The bar calls POST /api/gateway/restart and hides on success.
 */
export const useRestartBarStore = create<RestartBarState>()((set) => ({
  isVisible: false,
  show: () => set({ isVisible: true }),
  hide: () => set({ isVisible: false }),
}))
