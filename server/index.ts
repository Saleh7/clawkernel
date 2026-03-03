// ---------------------------------------------------------------------------
//  ClawKernel — Hono server
//
//  Entry points:
//    Production:  spawned by bin/clawkernel.mjs (config via CK_* env vars)
//    Development: `npm run dev:server` via tsx (reads ~/.clawkernel.json)
//
//  Serves the Vite dist/ build + all /api/* routes.
// ---------------------------------------------------------------------------

import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { handleChannelsSetup } from './routes/channels'
import { handleGatewayRestart } from './routes/gateway'
import { handleHealth } from './routes/health'
import { handlePrefsGet, handlePrefsPatch } from './routes/prefs'
import { handleVersionDismiss, handleVersionGet } from './routes/version'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const DIST = path.resolve(__dirname, '..', 'dist')
const INDEX_HTML_PATH = path.join(DIST, 'index.html')

// In dev mode (tsx server/index.ts), CK_* env vars are not set by clawkernel.mjs.
// Fall back to reading ~/.clawkernel.json directly so `npm run dev:server` works
// without manual env var setup.
interface ClawKernelConfig {
  gatewayUrl?: string
  gatewayToken?: string
  openclawHome?: string
  dashboardPort?: number
}

function loadLocalConfig(): ClawKernelConfig {
  try {
    const raw = readFileSync(path.join(os.homedir(), '.clawkernel.json'), 'utf8')
    const cfg = JSON.parse(raw) as ClawKernelConfig
    if (cfg.gatewayUrl?.startsWith('ws')) return cfg
  } catch {}
  return {}
}

const localCfg: ClawKernelConfig = process.env.CK_GATEWAY_URL ? {} : loadLocalConfig()

const PORT = Number(process.env.CK_PORT ?? localCfg.dashboardPort ?? 4173)
const HOST = process.env.CK_HOST ?? 'localhost'
const GATEWAY_URL = process.env.CK_GATEWAY_URL ?? localCfg.gatewayUrl ?? ''
const GATEWAY_TOKEN = process.env.CK_GATEWAY_TOKEN ?? localCfg.gatewayToken ?? ''
const OPENCLAW_HOME = process.env.CK_OPENCLAW_HOME ?? localCfg.openclawHome ?? '~/.openclaw'
const OPEN_BROWSER = process.env.CK_OPEN_BROWSER === '1'
const API_TOKEN = process.env.CK_API_TOKEN ?? ''

const COLOR = process.stdout.isTTY && !process.env.NO_COLOR
const clr = COLOR
  ? { m: '\x1b[95m', g: '\x1b[92m', dim: '\x1b[2m', b: '\x1b[1m', r: '\x1b[0m' }
  : { m: '', g: '', dim: '', b: '', r: '' }

// ---------------------------------------------------------------------------
//  Config injection into index.html
//
//  Built once and cached for the server's lifetime. In dev mode (no dist/),
//  the server still starts — SPA fallback returns a minimal dev-mode page.
// ---------------------------------------------------------------------------

const DEV_FALLBACK_HTML = `<!DOCTYPE html><html><head><title>ClawKernel</title></head><body>
<pre>dist/index.html not found.\n\nRun: npm run build\nThen restart the server.</pre></body></html>`

function buildInjectedHtml(): Buffer {
  if (!existsSync(INDEX_HTML_PATH)) {
    console.warn(`\n  ⚠  dist/index.html not found — serving dev fallback page.`)
    console.warn(`     Run: npm run build\n`)
    return Buffer.from(DEV_FALLBACK_HTML)
  }
  const raw = readFileSync(INDEX_HTML_PATH, 'utf8')
  return Buffer.from(
    raw.replace(
      '</head>',
      `  <script>window.__CK_CONFIG__=${JSON.stringify({
        gatewayUrl: GATEWAY_URL,
        gatewayToken: GATEWAY_TOKEN,
        openclawHome: OPENCLAW_HOME,
      })}</script>\n</head>`,
    ),
  )
}

const injectedHtmlBuffer = buildInjectedHtml()

const MIME_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
  ['.ttf', 'font/ttf'],
  ['.wasm', 'application/wasm'],
  ['.map', 'application/json'],
])

// ---------------------------------------------------------------------------
//  Auth middleware for mutating API endpoints
//
//  When CK_API_TOKEN is set, POST/PATCH/DELETE requests to /api/* require
//  a matching Authorization: Bearer <token> header. GET requests are always
//  public (health, version, prefs read). When CK_API_TOKEN is empty (default),
//  all endpoints are open — appropriate for localhost-only access.
// ---------------------------------------------------------------------------

function requireAuth(c: { req: { header: (name: string) => string | undefined } }): Response | null {
  if (!API_TOKEN) return null
  const header = c.req.header('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (token !== API_TOKEN) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  return null
}

const app = new Hono()

const api = new Hono().basePath('/api')
api.get('/health', handleHealth)
api.get('/version', handleVersionGet)
api.get('/prefs', handlePrefsGet)

api.post('/version/dismiss', (c) => {
  const denied = requireAuth(c)
  if (denied) return denied
  return handleVersionDismiss(c)
})
api.post('/gateway/restart', (c) => {
  const denied = requireAuth(c)
  if (denied) return denied
  return handleGatewayRestart(c)
})
api.post('/channels/setup', (c) => {
  const denied = requireAuth(c)
  if (denied) return denied
  return handleChannelsSetup(c)
})
api.patch('/prefs', (c) => {
  const denied = requireAuth(c)
  if (denied) return denied
  return handlePrefsPatch(c)
})
app.route('/', api)

// In dev mode, Vite handles static files with HMR. Non-API requests to this
// port redirect to Vite's dev server to prevent losing HMR by accident.
const VITE_DEV_PORT = 5173

const spaResponse = (): Response =>
  new Response(injectedHtmlBuffer, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
      'Content-Length': String(injectedHtmlBuffer.length),
    },
  })

app.all('*', async (c) => {
  if (IS_DEV) {
    const url = new URL(c.req.url)
    return c.redirect(`http://localhost:${VITE_DEV_PORT}${url.pathname}${url.search}`)
  }

  const url = new URL(c.req.url)
  const normalized = path.normalize(url.pathname)

  // Guard against path traversal
  const filePath = path.resolve(DIST, `.${normalized}`)
  if (!filePath.startsWith(DIST)) {
    return c.text('Forbidden', 403)
  }

  try {
    const fileStat = await stat(filePath)
    if (!fileStat.isFile()) return spaResponse()
  } catch {
    return spaResponse()
  }

  const isAsset = normalized.startsWith('/assets/')
  const ext = path.extname(filePath).toLowerCase()
  const mime = MIME_TYPES.get(ext) ?? 'application/octet-stream'
  const data = await readFile(filePath)

  return new Response(data, {
    headers: {
      'Content-Type': mime,
      'Cache-Control': isAsset ? 'public, max-age=31536000, immutable' : 'no-cache, no-store, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
    },
  })
})

const CONFIG_FILE = path.join(os.homedir(), '.clawkernel.json')
const displayHost = HOST === '0.0.0.0' ? 'localhost' : HOST
const serverUrl = `http://${displayHost}:${PORT}`

// Dev mode = launched directly via tsx (no CK_VERSION env var).
// Production = spawned by clawkernel.mjs (CK_VERSION is always set).
const IS_DEV = !process.env.CK_VERSION

serve({ fetch: app.fetch, port: PORT, hostname: HOST }, () => {
  if (IS_DEV) {
    console.log(`  ${clr.dim}API server ready on ${serverUrl} (proxied by Vite)${clr.r}`)
    return
  }

  console.log(`  ${clr.m}🦞 ClawKernel${clr.r}\n`)
  console.log(`  ${clr.g}➜${clr.r}  Local:    ${clr.b}${serverUrl}${clr.r}`)
  if (HOST === '0.0.0.0') {
    console.log(`  ${clr.g}➜${clr.r}  Network:  http://<your-ip>:${PORT}`)
  }
  console.log(`  ${clr.g}➜${clr.r}  Gateway:  ${GATEWAY_URL}`)
  console.log(`  ${clr.g}➜${clr.r}  Config:   ${clr.dim}${CONFIG_FILE}${clr.r}`)
  if (API_TOKEN) {
    console.log(`  ${clr.g}➜${clr.r}  Auth:     ${clr.dim}CK_API_TOKEN is set — mutating endpoints protected${clr.r}`)
  }
  console.log(`\n  Press ${clr.dim}Ctrl+C${clr.r} to stop.\n`)

  if (OPEN_BROWSER) {
    if (process.platform === 'win32') {
      spawn('cmd', ['/c', 'start', '', serverUrl], { detached: true, stdio: 'ignore' }).unref()
    } else {
      const bin = process.platform === 'darwin' ? 'open' : 'xdg-open'
      spawn(bin, [serverUrl], { detached: true, stdio: 'ignore' }).unref()
    }
  }
})
