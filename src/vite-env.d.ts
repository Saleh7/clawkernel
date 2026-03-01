/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GATEWAY_URL: string
  readonly VITE_GATEWAY_TOKEN: string
  readonly VITE_OPENCLAW_HOME: string
  readonly VITE_APP_VERSION: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Injected by the ClawKernel CLI at serve time (bin/clawkernel.mjs).
// Takes priority over build-time env vars but yields to localStorage.
interface Window {
  __CK_CONFIG__?: {
    gatewayUrl?: string
    gatewayToken?: string
    openclawHome?: string
  }
}
