import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const pkg = require('./package.json') as { version: string }

export default defineConfig({
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
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
