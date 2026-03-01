#!/usr/bin/env node

/**
 * ClawKernel CLI — static file server for the pre-built UI.
 * Config saved to ~/.clawkernel.json, injected into index.html at serve time.
 * No dependencies — uses Node.js built-ins only.
 */

import http     from 'node:http'
import fs       from 'node:fs'
import os       from 'node:os'
import path     from 'node:path'
import readline from 'node:readline'
import { Writable }      from 'node:stream'
import { fileURLToPath } from 'node:url'
import { spawn }         from 'node:child_process'

// ---------------------------------------------------------------------------
//  Paths
// ---------------------------------------------------------------------------

const __dirname   = path.dirname(fileURLToPath(import.meta.url))
const DIST        = path.resolve(__dirname, '..', 'dist')
const INDEX_HTML  = path.join(DIST, 'index.html')
const ASSETS      = path.join(DIST, 'assets')
const CONFIG_FILE = path.join(os.homedir(), '.clawkernel.json')

// ---------------------------------------------------------------------------
//  Colors — respects NO_COLOR and non-TTY environments
// ---------------------------------------------------------------------------

const COLOR = process.stdout.isTTY && !process.env.NO_COLOR
const c = COLOR
  ? { m: '\x1b[95m', g: '\x1b[92m', dim: '\x1b[2m', b: '\x1b[1m', r: '\x1b[0m' }
  : { m: '',         g: '',         dim: '',         b: '',        r: ''         }

// ---------------------------------------------------------------------------
//  CLI args  (port resolved after config is loaded)
// ---------------------------------------------------------------------------

const args = process.argv.slice(2)
let portArg     = null   // null = not explicitly set; falls back to config.dashboardPort
let host        = 'localhost'
let openBrowser = false
let reset       = false

for (let i = 0; i < args.length; i++) {
  const arg = args[i]

  if ((arg === '--port' || arg === '-p') && args[i + 1]) {
    const n = Number(args[++i])
    if (!Number.isInteger(n) || n < 1 || n > 65535) {
      console.error(`\n  ✖  Invalid port: "${n}". Must be 1–65535.\n`)
      process.exit(1)
    }
    portArg = n

  } else if (arg === '--host' && args[i + 1]) {
    host = args[++i]

  } else if (arg === '--open' || arg === '-o') {
    openBrowser = true

  } else if (arg === '--reset') {
    reset = true

  } else if (arg === '--help' || arg === '-h') {
    console.log(`
  ${c.m}🦞 ClawKernel${c.r} — self-hosted OpenClaw management UI

  Usage: clawkernel [options]

  Options:
    --port, -p <number>   Override dashboard port  (default: saved config or 4173)
    --host <host>         Host to bind to          (default: localhost)
    --open, -o            Open browser on startup
    --reset               Re-run the setup wizard
    --help, -h            Show this help
`)
    process.exit(0)

  } else {
    console.error(`\n  ✖  Unknown option: "${arg}". Run clawkernel --help for usage.\n`)
    process.exit(1)
  }
}

// ---------------------------------------------------------------------------
//  Preflight
// ---------------------------------------------------------------------------

if (!fs.existsSync(INDEX_HTML)) {
  console.error(`
  ✖  No build found at dist/index.html.

     If you installed via npm, this is a bug — please report it at:
     https://github.com/Saleh7/clawkernel/issues

     If you cloned the repo, run:  npm run build
`)
  process.exit(1)
}

// ---------------------------------------------------------------------------
//  Config — load / save
// ---------------------------------------------------------------------------

/** @typedef {{ gatewayUrl: string, gatewayToken: string, openclawHome: string, dashboardPort: number }} Config */

/** @returns {Config | null} */
function loadConfig() {
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
    if (cfg?.gatewayUrl?.startsWith('ws://') || cfg?.gatewayUrl?.startsWith('wss://')) return cfg
  } catch { /* first run */ }
  return null
}

/** @param {Config} cfg */
function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2) + '\n', { mode: 0o600 })
}

// ---------------------------------------------------------------------------
//  Setup wizard
// ---------------------------------------------------------------------------

/** Drops echoed characters when muted — token input is invisible (like sudo). */
class PromptOutput extends Writable {
  constructor() { super(); this.muted = false }
  _write(chunk, _enc, cb) { if (!this.muted) process.stdout.write(chunk); cb() }
}

async function runSetup() {
  // Box header
  console.log(`
${c.m}  ┌──────────────────────────────────────────┐
  │  ${c.b}//  CLAWKERNEL  —  Setup Wizard${c.r}${c.m}         │
  └──────────────────────────────────────────┘${c.r}`)

  const isTTY  = Boolean(process.stdin.isTTY)
  const output = new PromptOutput()
  const rl     = readline.createInterface({ input: process.stdin, output, terminal: isTTY })

  // Line queue — prevents the piped-input race condition where rl.once('line')
  // misses events that fired before the next listener was registered.
  const lineQueue   = /** @type {string[]} */ ([])
  const lineWaiting = /** @type {Array<(l: string) => void>} */ ([])
  rl.on('line', line =>
    lineWaiting.length > 0 ? lineWaiting.shift()(line) : lineQueue.push(line),
  )

  // Ctrl+C / Ctrl+D / stdin close during setup — exit cleanly, no warning.
  let setupDone = false
  rl.on('close', () => { if (!setupDone) { process.stdout.write('\n'); process.exit(0) } })

  const nextLine = () => new Promise(resolve =>
    lineQueue.length > 0 ? resolve(lineQueue.shift()) : lineWaiting.push(resolve),
  )

  const ask = async (question, defaultVal = '') => {
    const hint = defaultVal ? ` ${c.dim}(${defaultVal})${c.r}` : ''
    process.stdout.write(`\n  ${c.g}?${c.r} ${question}${hint}${c.dim}:${c.r} ${c.g}>${c.r} `)
    const answer = await nextLine()
    return answer.trim() || defaultVal
  }

  const askSecret = async (question, hint = '') => {
    const hintText = hint ? ` ${c.dim}(${hint})${c.r}` : ''
    process.stdout.write(`\n  ${c.g}?${c.r} ${question}${hintText}${c.dim}:${c.r} ${c.g}>${c.r} `)
    if (isTTY) output.muted = true
    const answer = await nextLine()
    if (isTTY) { output.muted = false; process.stdout.write('\n') }
    return answer.trim()
  }

  let gatewayUrl = ''
  while (true) {
    gatewayUrl = await ask('Gateway WebSocket URL', 'ws://localhost:18789')
    if (gatewayUrl.startsWith('ws://') || gatewayUrl.startsWith('wss://')) break
    process.stdout.write(`\n  ✖  URL must start with ws:// or wss://  (e.g. ws://localhost:18789)\n`)
  }
  const gatewayToken   = await askSecret('Gateway Token', 'optional — leave blank if auth.mode is none')
  const openclawHome   = await ask('OpenClaw home directory', '~/.openclaw')
  const dashboardPort  = Number(await ask('Dashboard Port', '4173')) || 4173

  setupDone = true
  rl.close()

  const cfg = { gatewayUrl, gatewayToken, openclawHome, dashboardPort }
  saveConfig(cfg)

  // Clear wizard input from the terminal before the server banner prints.
  // Uses \x1b[2J\x1b[H (erase visible screen + move cursor home) rather than
  // console.clear() so the scrollback buffer is preserved.
  if (process.stdout.isTTY) process.stdout.write('\x1b[2J\x1b[H')

  return cfg
}

// ---------------------------------------------------------------------------
//  Load or create config
// ---------------------------------------------------------------------------

const config = (reset ? null : loadConfig()) ?? await runSetup()
const port   = portArg ?? config.dashboardPort ?? 4173

// ---------------------------------------------------------------------------
//  MIME types
// ---------------------------------------------------------------------------

const MIME_TYPES = new Map([
  ['.html',  'text/html; charset=utf-8'],
  ['.js',    'text/javascript; charset=utf-8'],
  ['.mjs',   'text/javascript; charset=utf-8'],
  ['.css',   'text/css; charset=utf-8'],
  ['.json',  'application/json; charset=utf-8'],
  ['.svg',   'image/svg+xml; charset=utf-8'],
  ['.png',   'image/png'],  ['.jpg',   'image/jpeg'],
  ['.jpeg',  'image/jpeg'], ['.gif',   'image/gif'],
  ['.webp',  'image/webp'], ['.ico',   'image/x-icon'],
  ['.woff',  'font/woff'],  ['.woff2', 'font/woff2'],
  ['.ttf',   'font/ttf'],   ['.wasm',  'application/wasm'],
  ['.map',   'application/json'],
])
const getMime = (f) => MIME_TYPES.get(path.extname(f).toLowerCase()) ?? 'application/octet-stream'

// ---------------------------------------------------------------------------
//  Config injection into index.html (built once, cached for server lifetime)
// ---------------------------------------------------------------------------

const indexHtml = Buffer.from(
  fs.readFileSync(INDEX_HTML, 'utf8').replace(
    '</head>',
    `  <script>window.__CK_CONFIG__=${JSON.stringify({
      gatewayUrl:   config.gatewayUrl,
      gatewayToken: config.gatewayToken,
      openclawHome: config.openclawHome,
    })}</script>\n</head>`,
  ),
)

// ---------------------------------------------------------------------------
//  Request handler
// ---------------------------------------------------------------------------

const server = http.createServer((req, res) => {
  let urlPath
  try { urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname) }
  catch { res.writeHead(400); res.end(); return }

  const resolved = path.resolve(DIST, '.' + path.normalize(urlPath))
  if (resolved !== DIST && !resolved.startsWith(DIST + path.sep)) {
    res.writeHead(403); res.end(); return
  }

  const isFile = fs.existsSync(resolved) && fs.statSync(resolved).isFile()
  const target = isFile ? resolved : INDEX_HTML

  if (target === INDEX_HTML) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Content-Length', indexHtml.length)
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(indexHtml)
    return
  }

  const isAsset = target.startsWith(ASSETS + path.sep)
  res.setHeader('Cache-Control', isAsset ? 'public, max-age=31536000, immutable' : 'no-cache, no-store, must-revalidate')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.writeHead(200, { 'Content-Type': getMime(target) })
  fs.createReadStream(target).on('error', () => res.end()).pipe(res)
})

// ---------------------------------------------------------------------------
//  Startup
// ---------------------------------------------------------------------------

server.on('error', (err) => {
  console.error(err.code === 'EADDRINUSE'
    ? `\n  ✖  Port ${port} is already in use. Try: clawkernel --port <number>\n`
    : `\n  ✖  ${err.message}\n`)
  process.exit(1)
})

const displayHost = host === '0.0.0.0' ? 'localhost' : host
const url         = `http://${displayHost}:${port}`

server.listen(port, host, () => {
  console.log(`  ${c.m}🦞 ClawKernel${c.r}\n`)
  console.log(`  ${c.g}➜${c.r}  Local:    ${c.b}${url}${c.r}`)
  if (host === '0.0.0.0') console.log(`  ${c.g}➜${c.r}  Network:  http://<your-ip>:${port}`)
  console.log(`  ${c.g}➜${c.r}  Gateway:  ${config.gatewayUrl}`)
  console.log(`  ${c.g}➜${c.r}  Config:   ${c.dim}${CONFIG_FILE}${c.r}`)
  console.log(`\n  Press ${c.dim}Ctrl+C${c.r} to stop.\n`)

  if (openBrowser) {
    if (process.platform === 'win32') {
      // `start` is a cmd.exe built-in — must be invoked via cmd /c
      spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref()
    } else {
      spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { detached: true, stdio: 'ignore' }).unref()
    }
  }
})

// ---------------------------------------------------------------------------
//  Graceful shutdown
// ---------------------------------------------------------------------------

const shutdown = () => { process.stdout.write('\n'); server.close(() => process.exit(0)) }
process.on('SIGINT',  shutdown)
process.on('SIGTERM', shutdown)
