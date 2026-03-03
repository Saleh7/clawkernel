#!/usr/bin/env node

/**
 * ClawKernel CLI — setup wizard + server launcher.
 * Config saved to ~/.clawkernel.json. Spawns bin/server.mjs (Hono) for
 * static file serving + API routes. No dependencies — uses Node.js built-ins only.
 */

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

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
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
//  Spawn server.mjs (Hono — handles static files + /api/* routes)
// ---------------------------------------------------------------------------

const PKG_VERSION = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf8'),
).version

const SERVER_MJS = path.join(__dirname, 'server.mjs')

if (!fs.existsSync(SERVER_MJS)) {
  console.error(`
  ✖  Server not found at ${SERVER_MJS}

     If you installed via npm, this is a bug — please report it at:
     https://github.com/Saleh7/clawkernel/issues

     If you cloned the repo, run:  npm run build
`)
  process.exit(1)
}

const serverProc = spawn(process.execPath, [SERVER_MJS], {
  // CWD = package root so that server.mjs can resolve dist/ correctly
  cwd: path.resolve(__dirname, '..'),
  env: {
    ...process.env,
    CK_GATEWAY_URL:   config.gatewayUrl,
    CK_GATEWAY_TOKEN: config.gatewayToken ?? '',
    CK_OPENCLAW_HOME: config.openclawHome ?? '~/.openclaw',
    CK_PORT:          String(port),
    CK_HOST:          host,
    CK_OPEN_BROWSER:  openBrowser ? '1' : '0',
    CK_VERSION:       PKG_VERSION,
  },
  stdio: 'inherit',
})

serverProc.on('error', (err) => {
  console.error(`\n  ✖  Failed to start server: ${err.message}\n`)
  process.exit(1)
})

serverProc.on('exit', (code) => {
  process.exit(code ?? 0)
})

// ---------------------------------------------------------------------------
//  Graceful shutdown — forward signals to child process
// ---------------------------------------------------------------------------

const shutdown = () => { serverProc.kill('SIGTERM') }
process.on('SIGINT',  shutdown)
process.on('SIGTERM', shutdown)
