import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import os from 'node:os'
import path from 'path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const pkg = require('./package.json') as { version: string }

// ---------------------------------------------------------------------------
//  Dev: inject window.__CK_CONFIG__ from ~/.clawkernel.json
//  In production, bin/server.mjs injects this at serve time.
//  In dev (Vite HMR), we inject it via transformIndexHtml so the React app
//  can connect to the Gateway without running the full CLI setup.
// ---------------------------------------------------------------------------

interface ClawKernelConfig {
  gatewayUrl?: string
  gatewayToken?: string
  openclawHome?: string
}

function loadDevCkConfig(): ClawKernelConfig {
  try {
    const raw = fs.readFileSync(path.join(os.homedir(), '.clawkernel.json'), 'utf8')
    const cfg = JSON.parse(raw) as ClawKernelConfig
    if (cfg.gatewayUrl?.startsWith('ws')) return cfg
  } catch {
    // No config — app will start with empty Gateway URL (connection error shown in UI)
  }
  return {}
}

const devCkConfig = loadDevCkConfig()

export default defineConfig({
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    tailwindcss(),
    // Injects window.__CK_CONFIG__ during dev (Vite dev server only).
    // The production server (bin/server.mjs) does its own injection at serve time.
    {
      name: 'ck-config-inject',
      apply: 'serve',
      transformIndexHtml() {
        return [
          {
            tag: 'script',
            injectTo: 'head-prepend',
            children: `window.__CK_CONFIG__=${JSON.stringify({
              gatewayUrl: devCkConfig.gatewayUrl ?? '',
              gatewayToken: devCkConfig.gatewayToken ?? '',
              openclawHome: devCkConfig.openclawHome ?? '~/.openclaw',
            })}`,
          },
        ]
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // Proxy /api/* to the Hono backend running on port 4174 in dev.
    // The backend reads ~/.clawkernel.json automatically when CK_* env vars are absent.
    proxy: {
      '/api': {
        target: 'http://localhost:4174',
        changeOrigin: true,
      },
    },
  },
  build: {
    // Shiki WASM chunk (~622KB) is lazy-loaded only when code blocks are rendered.
    // Raising the limit avoids a misleading warning for an already-optimized split.
    chunkSizeWarningLimit: 650,
    // Source maps for production error tracking (hidden = not publicly linked but available)
    sourcemap: 'hidden',
  },
})
