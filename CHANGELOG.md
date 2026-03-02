# Changelog

---

## [Unreleased]

### Added

#### Skills `/skills`
- **Global skills page** — `skills.status` per agent; groups by source (Workspace · Built-in · Installed · Other)
- **Stats bar** — 5 tiles: Total · Ready · Needs Setup · Blocked · Disabled
- **Availability badges** — Ready (green) / Needs Setup (amber) / Blocked (red) / Disabled (muted)
- **Grid + list view** — toggle between card grid and compact list; collapsible source groups
- **Enable / Disable** — inline toggle per skill via `skills.update { skillKey, enabled }`
- **Install dependencies** — per-install-option buttons via `skills.install { name, installId, timeoutMs: 120s }`
- **API key input** — inline form for missing `env` requirements via `skills.update { skillKey, apiKey }`
- **Agent selector** — dropdown to view skills for any configured agent (multi-agent setups)
- **Search + filter** — text search across name/description/key; status filter (All / Ready / Needs Setup / Blocked)
- **Detail panel** — slide-over with full description, status toggle, requirements, missing items, install options, API key form, homepage link, source path

#### Models `/models`
- **Routing section** — displays default model + fallback chain + image model + image fallbacks from `config.get`
- **Aliases table** — model ID → alias mapping from `agents.defaults.models`
- **Provider status** — per-provider cards showing API key configured/missing from config
- **Available models** — full catalog from `models.list` grouped by provider: name · ID · context window · reasoning · vision badges
- **Model search** — client-side filter across name/ID/provider
- **`ModelCatalogEntry` type** added to gateway types (`id · name · provider · contextWindow · reasoning · input`)

#### Dashboard
- **6 metric tiles:** Gateway status, Latency (color-coded: green < 50ms, orange < 200ms, red > 200ms), Agents, Sessions, Channels, Cron (active/failing count)
- **Today's Cost banner** — fetches `usage.cost` (last 1 day) on connect; shows total cost + token count with link to `/usage`
- **Gateway Latency tile** — round-trip ms measured via `health` probe on connect
- **Cron Summary tile** — enabled job count + failing job count from store; status color reflects failing state
- **Quick Actions** — "New Agent" button (reuses `CreateAgentDialog`) + "Open Chat" navigation button in dashboard header

#### Chat Notification Toast
- Toast with agent name + 120-char message preview when a chat `final` event arrives while the user is not on `/chat`; auto-dismiss after 6s; "Open" action navigates to `/chat`

#### Time Format Preference
- 12h/24h toggle stored in `localStorage` via `useSyncExternalStore`; click the status bar clock to switch; applied to dashboard session timestamps

#### Channels `/channels`
- **Channel Status Grid** — card per channel with connection status dot (green/yellow/red), account pills, last error display, auto-refresh every 30s
- **Channel Settings** — DM policy (pairing/allow/deny) and Group policy (allow/mention/deny) selectors via `config.patch`
- **Token Setup** — inline token input for Telegram, Discord, Slack with show/hide toggle; saves via `config.patch` → gateway auto-reconnects
- **WhatsApp/Signal QR Login** — modal with `web.login.start` → QR code display → `web.login.wait` (120s timeout) → success/error feedback
- **Device Pairing Management** — pending requests (approve/reject) + paired devices table (rotate token, revoke token, remove device) via `device.pair.*` and `device.token.*` APIs
- **DM Pairing Queue** — contacts awaiting approval per channel; approve adds to `allowFrom` via `config.patch`
- **Pairing Bell** — global bell icon in status bar with pending request count badge; popover dropdown with approve/reject actions; polls `device.pair.list` every 15s (visibility-aware); bounce animation on new requests
- **Channel Setup Wizard** — 3-step dialog (Choose → Configure → Done); "Add Channel" button on page header; shows all 5 supported channels (Telegram, Discord, Slack, WhatsApp, Signal) with Configured/Needs setup badge; token input + QR trigger; post-setup checklist per channel with docs links
- **Enable/Disable Toggle** — per-channel power button with confirm dialog; `config.patch` → root + account-level `enabled`; toast "gateway restarting…"; disabled cards at 60% opacity + "Disabled" label
- New route: `/channels` with sidebar navigation
- New UI primitive: `Select` component (`radix-ui` based)

#### Cron `/cron`
- **Global Cron Hub** — dedicated page listing all cron jobs across all agents with real-time stats bar (scheduler status, total/enabled/failing counts, next wake timer)
- **Job Cards** — collapsed view with status dot, human-readable schedule, agent label, next-run countdown, delivery warning badge; quick actions (enable/disable, run now, edit, delete)
- **Expanded Job Detail** — configuration panel, delivery config, 4 execution tiles (last run, next run, duration, status with consecutive-error count), prompt preview, paginated run history
- **Create Job Wizard** — 5-step dialog (Basics → Schedule → Payload → Delivery → Review); 11 schedule presets + custom cron/interval/one-shot; agent selector; model override + thinking level; announce delivery with best-effort flag
- **Inline Edit Form** — flat layout with schedule, payload, delivery, and flag editors; opens below the card header
- **Failure Guide** — pattern-matched error diagnosis with actionable fix steps; covers delivery-target, auth, model, timeout, and network errors; technical details collapsible
- **`cronToHuman()` formatter** — human-readable schedule labels (`0 8 * * *` → "Daily at 8:00 AM"); respects 12h/24h preference
- **Run History** — per-job paginated list with status icons, timestamps, duration, model, session ID; expandable detail view with summary, session key, and delivery status
- **URL deep-linking** — `?job=<id>` scrolls to and highlights a job; `?show=errors` auto-expands the first failing job
- **Sorting & filtering** — sort by next run / last updated / name (asc/desc); filter by all / enabled / disabled; search by name
- Shared cron formatters extracted to `src/lib/cron.ts` — `formatSchedule`, `formatRelative`, `formatDuration`, `cronToHuman`, `buildFailureGuide`
- New route: `/cron` with sidebar navigation

### Fixed

#### Channels
- **`config.patch` hash-conflict retry** — `isHashConflict()` now matches all three Gateway error variants, including `"config changed since last load; re-run config.get and retry"` (the most common stale-hash message, which doesn't contain the word "hash"). All three `config.patch` call sites (`channel-card`, `channel-settings`, `setup-wizard`) use `patchConfigWithRetry` and auto-retry once with a fresh `baseHash` on conflict.

#### Cron
- **`formToDelivery` mode=none** — previously returned `undefined`, which was absent in JSON and left an existing delivery intact on update; now correctly returns `{ mode: 'none' }` so the Gateway clears delivery when the user selects "No delivery"
- **`staggerMs` preserved on edit** — `CronSchedule` type, `formToSchedule`, and `jobToForm` (via `scheduleToForm`) all carry `staggerMs`; editing a job with a non-zero stagger no longer silently drops the value
- **`useCronRuns` race condition** — `setLoading(false)` / `setLoadingMore(false)` moved to a `finally` block; a stale-job `return` inside `try` no longer leaves the loading spinner stuck indefinitely
- **Wizard dead network call** — removed a `useEffect` that called `agents.list` on wizard open but discarded the result; agent list is already available from the gateway store snapshot
- **`cron.list` redundant param** — removed `includeDisabled` from the request; the `enabled` filter param is the canonical API, and sending both is redundant (verified against `server-methods/cron.ts`)
- **Wizard review — unconditional ellipsis** — payload preview now appends `…` only when `payloadText.length > 80`; short messages no longer show a trailing ellipsis
- **Unused import** — removed `AgentsListResult` import from `create-job-wizard.tsx` (leftover after the dead network call was removed)

### Changed
- Agent Cron tab now uses shared `cronToHuman()` formatter with 12h/24h support
- Gateway types updated: `CronDelivery`, `CronJobsListResult`, `CronRunsResult`, `CronDeliveryStatus`, pagination support for `cron.list` and `cron.runs`
- Dashboard refactored from monolithic component into feature-based structure: `components/`, `hooks/`, `types.ts`
- `MetricTile` extracted as reusable component
- `SessionsCard` and `PresenceCard` extracted as standalone components
- Status bar clock clickable to toggle 12h/24h format; respects stored preference
- Pairing Bell added to global status bar — always visible

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
