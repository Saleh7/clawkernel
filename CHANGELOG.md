# Changelog

---

## [2026.2.24-1] — 2026-02-24-1

### Added
- CI/CD pipeline (`.github/workflows/ci.yml`) — matrix on Node 20 & 22, SLSA Level 2 provenance via `--provenance`, concurrency cancel-in-progress for PRs
- CLI: server banner now prints config file path (`~/.clawkernel.json`) so first-time users know where config is stored

- README: `npx clawkernel` as primary Quick Start; `## CLI Options` section with all flags; Development section separated from user flow; npm version badge
- `package.json`: 13 targeted keywords for npm/GitHub discoverability; description leads with product name

### Changed
- CSP `connect-src`: `ws://localhost:* wss:` → `ws: wss:` — allows any self-hosted WebSocket origin
- `loadConfig()`: re-validates saved URL scheme on every start — rejects malformed or tampered config
- Setup wizard: URL prompt loops until valid `ws://` / `wss://` scheme is entered
- Setup wizard: Gateway Token prompt shows `(optional — leave blank if auth.mode is none)` hint
- Setup wizard: terminal cleared after completion (`\x1b[2J\x1b[H`) — server banner appears on a clean screen; scrollback buffer preserved
- `handleSend` callback: stabilized via `isBusyRef` + `runIdRef` — eliminates ~30 fps recreation during streaming
- Chat history reload: follows OpenClaw `shouldReloadHistoryForFinalEvent` — reloads only when final event carries no valid assistant message
- `HISTORY_PAGE_SIZE = 200` constant replaces three hardcoded `limit: 200` occurrences
- Content type guard: `(c: any)` → `(c: ChatMessageContent)` with `'text' in c` narrowing
- `useSessionsPage`: removed derived `listWindowResetKey` string and always-truthy `if` guard; replaced with explicit individual deps
- `biome.json`: five a11y rules promoted from `"off"` → `"warn"` (`useButtonType`, `noSvgWithoutTitle`, `useKeyWithClickEvents`, `noStaticElementInteractions`, `noLabelWithoutControl`)
- `ImageLightbox`: restructured as `role="dialog" aria-modal="true"` with separate backdrop `<button tabIndex={-1}>`; global `window` Escape handler via `useEffect` — fires regardless of focus position
- Drop zone: `<div>` → `<section aria-label="Chat area">` — semantically correct landmark element
- Shiki theme toggle: `MutationObserver` on `documentElement.class` — dark/light switch now triggers live re-highlight

### Fixed
- Windows `--open` flag: `spawn('start', [url])` → `spawn('cmd', ['/c', 'start', '', url])` — `start` is a `cmd.exe` built-in
- Two `await import('@/stores/gateway-store')` dynamic imports → direct `useGatewayStore.getState().client` — module was already statically imported
- `main.tsx`: `getElementById('root')!` non-null assertion → explicit null check with descriptive error message
- Gap recovery: silent `.catch(() => {})` → `.catch((err) => log.warn(...))`
- Raw `AlertDialog` in chat (8 lines, 9 imports) → `<ConfirmDialog>` shared component
- `agent-files.tsx` tabs: `<div role="button">` containing `<button>` → outer `<div>` + sibling `<button>` (label) + `<button>` (close)
- `bubble.tsx`: clickable `<img>` → `<button type="button">` with `aria-label` and `focus-visible` ring
- `sources-panel.tsx`: backdrop `<div onClick>` → `<button type="button" tabIndex={-1}>`
- `error-boundary.tsx`: decorative SVGs missing `aria-hidden="true"`; reload button missing `type="button"`
- 24 `<button>` elements across 14 files missing `type="button"` — prevents accidental form submission in all browsers
- CI tag trigger: `tags: ['v*']` → `tags: ['[0-9]*']` — calendar versions never matched `v*`

### Security
- A11y fixes make all interactive elements keyboard-accessible — no mouse-only interactions remain

---

## [2026.2.24] — 2026-02-24

*ClawKernel CLI — first public release as an npm package.*

### Added

#### CLI — `bin/clawkernel.mjs`
- Zero-dependency static file server using Node.js built-ins only (`http`, `fs`, `path`, `readline`, `stream`, `child_process`)
- Interactive setup wizard on first run — prompts for Gateway WebSocket URL, auth token, OpenClaw home directory, and dashboard port
- Config persisted at `~/.clawkernel.json` — survives restarts, editable with `--reset`
- Runtime config injection: `window.__CK_CONFIG__` injected into `index.html` at serve time — no rebuild needed to change settings
- CLI flags: `--port` / `-p`, `--host`, `--open` / `-o`, `--reset`, `--help` / `-h`
- `NO_COLOR` and non-TTY detection — clean output in CI and piped environments
- SPA fallback — all non-asset routes serve `index.html`
- Immutable cache headers for hashed Vite assets; `no-store` for HTML
- Graceful shutdown on `SIGINT` and `SIGTERM`
- Cross-platform browser launch (`open` / `xdg-open` / `cmd /c start`)
- Ctrl+C and Ctrl+D during wizard exit cleanly with no unhandled-rejection warnings
- `STRUCTURE.md` — architecture documentation at project root
- Biome for lint + format (replaces ESLint); Knip for dead code detection

### Changed
- Project renamed from internal codename **Mission Control** to **ClawKernel**
- Removed calendar, notifications, settings, terminal, and logs pages — scope focused on core Gateway operations

### Security
- Config file saved with `0o600` permissions — readable only by the current OS user
- Path traversal prevention — static file handler validates all paths against `DIST` boundary
- `.env` and all secrets excluded from published package (`"files": ["dist/", "bin/"]`)
- `X-Content-Type-Options: nosniff` on all responses

---

## [2026.2.23] — 2026-02-23

*Sessions management and Cron job scheduler.*

### Added

#### Sessions Page
- Full session list across all agents with real-time state
- Quick filters: All, Active, Idle, Compacted
- Indexed session store for O(1) lookups by session key
- Deferred search with `useDeferredValue` — UI stays responsive during fast typing
- Sort by: last active, session key, kind
- Virtualized flat list via `@tanstack/react-virtual` — handles thousands of sessions without layout jank
- Agent grouping view — sessions collapsed under their parent agent with expand/collapse
- Session card: status dot, model badge, token usage, session key, relative timestamps
- Session preview on hover with last message excerpt
- Patch session dialog — edit label, description, and log level live
- Send message dialog — inject a message into any session without opening chat
- Delete session with confirmation dialog
- Bulk delete — multi-select sessions and delete in a single action
- Session history dialog — full message history for any session in a slide-in panel
- Auto-refresh toggle with configurable interval
- Stats bar: total sessions, active count, idle count

#### Agents — Cron Tab
- Cron job scheduler per agent: create, edit, and delete recurring jobs
- Session target: `main` (shared session) or `isolated` (fresh session per run)
- Wake mode: `now` (immediate) or `next-heartbeat` (aligned to agent heartbeat)
- Run history panel per job — expandable list of past executions with status and timing
- Delete job dialog with confirmation

#### Agents — Activity Tab
- Real-time activity feed for each agent
- Per-event payload inspector — expandable JSON viewer
- Filter by event type

### Changed
- `saveRawConfigWithRetry` — hash-conflict safe wrapper for full raw config writes; integrated into agent binding and cloning workflows

---

## [2026.2.22] — 2026-02-22

*Real-time chat with streaming, tool calls, and media.*

### Added

#### Chat Page
- Real-time streaming chat with RAF-throttled rendering at ~30 fps
- Full message history with paginated `Load More` (200 messages per page)
- Streaming bubble with animated shimmer during generation
- Tool call rendering — grouped tool calls with collapsible input/output viewer per call
- Thinking block display — collapsible reasoning section (toggle via settings popover)
- Image attachments: drag-and-drop onto chat area, clipboard paste (`Ctrl+V`), file picker — JPEG / PNG / WebP / GIF
- Image compression before upload with `createImageBitmap` fallback for browser compatibility
- Image lightbox — click any image to view full size; Escape or backdrop click to close
- Source citations panel — inline `[n]` links open a slide-in panel with full source list and clickable URLs
- Retry: re-send the last user message without retyping
- Abort: cancel an in-progress generation mid-stream
- Session sidebar: browse and switch sessions, preview last message on hover, manual refresh
- New session button — starts a fresh context for the current agent
- Settings popover: toggle thinking block visibility
- Compaction indicator — shown when the gateway has compacted the context window
- Fallback indicator — shown when the gateway is operating in degraded mode
- Context meter — circular arc showing token usage vs. model limit; pulses red above 80%
- Processing indicator — animated dots during tool execution
- RTL / LTR text direction auto-detection per message
- Keyboard shortcuts: `Escape` clears attachments / closes lightbox / closes sources panel
- `DOMPurify` sanitization with strict allowlist — external images blocked, all anchors forced `rel="noreferrer noopener"`
- Shiki syntax highlighting — 13 languages, lazy-loaded WASM only when code blocks are present
- LRU markdown cache (200 entries, 50 KB max) — avoids re-parsing identical streamed content
- WeakMap text cache for fast message content extraction
- Message queue — incoming events buffered during render to prevent dropped frames

---

## [2026.2.21] — 2026-02-21

*Full agent management with 9 dedicated tabs.*

### Added

#### Agents Page
- Agent list panel with live status indicators (idle, active, running) and model labels
- Each agent isolated under a `TabErrorBoundary` — a crash in one tab never affects others
- **9 agent tabs:**
  - **Overview** — model selector, system prompt editor, memory settings, token usage stats, quick actions (send message, open new session), Danger Zone (clear all sessions, reset workspace)
  - **Files** — in-browser code editor with multi-tab support, dirty-state dot indicator, save / discard, folder tree navigation, file-type emoji icons
  - **Tools** — full tool catalog with enable/disable toggles, plugin-aware grouping, per-tool permission display; unsaved-changes warning on tab navigation
  - **Skills** — skill library with section grouping, enable/disable toggles, install options; unsaved-changes warning
  - **Channels** — active channel bindings with type, kind, and metadata display
  - **Cron** — recurring job scheduler per agent (detailed in [2026.2.23])
  - **Sessions** — agent-scoped session list with send message, patch, delete, and preview
  - **Bindings** — raw binding configuration viewer
  - **Activity** — real-time event feed per agent (detailed in [2026.2.23])
- Create agent dialog — ID, model, system prompt, memory configuration
- Delete agent dialog with confirmation
- Clone agent dialog — selective field copy: identity, tools, skills, channels, cron
- Agent comparison view — diff two agents side by side
- Edit identity dialog — update name, description, emoji, and system prompt live
- `config-utils.ts` — patch utility for atomic config writes with hash-conflict auto-retry
- `normalizeAgentId` — sanitizes agent IDs for consistent lookup

---

## [2026.2.20] — 2026-02-20

*Project foundation — WebSocket client, routing, and design system.*

### Added

#### Core Infrastructure
- React 19 + TypeScript (strict) + Vite 7 project bootstrap
- React Router v7 with lazy-loaded routes — Dashboard, Agents, Chat, Sessions
- `PageErrorBoundary` on every route — unhandled errors show a recovery UI instead of a blank screen
- `PageSkeleton` loading state for lazy-loaded routes
- `createLogger` structured logging with named scopes — replaces all `console.*` calls throughout

#### OpenClaw Gateway WebSocket Client
- Persistent WebSocket connection to OpenClaw Gateway (`ws://` / `wss://`)
- Ed25519 device identity — keypair generated once, challenge-nonce authentication per session
- Exponential backoff with jitter on disconnect — prevents thundering herd on gateway restart
- Sequence gap detection — detects missed events and triggers automatic session refresh
- Zustand store as single source of truth: agents, sessions, identities, active runs, channels
- Stable `instanceId` per browser tab — prevents duplicate event subscriptions on hot reload

#### Design System
- Dark and light theme with toggle button; Material Palenight High Contrast dark palette
- Responsive collapsible sidebar — collapses to icon-only on narrow viewports
- shadcn/ui component library built on Radix UI primitives
- Tailwind CSS v4 with CSS custom properties for theming
- `ConfirmDialog` shared component — consistent destructive-action confirmation across the app
- Sonner toast notifications for user-facing feedback
- Status bar — persistent bottom bar showing gateway connection state, model info, and run count

### Security
- Ed25519 challenge-nonce authentication — no long-lived credentials transmitted after the initial handshake
- CSP meta tag: `default-src 'self'`, `connect-src ws://localhost:* wss:`, `wasm-unsafe-eval` for Shiki WASM, `frame-ancestors 'none'`
- All anchor tags forced to `rel="noreferrer noopener" target="_blank"` — prevents tab-napping

---

*For unreleased changes, see the [repository](https://github.com/Saleh7/clawkernel).*
