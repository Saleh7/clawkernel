# Changelog

---

## [2026.2.26] — 2026.2.26

### Added

#### Testing Infrastructure (Vitest)
- **Vitest test runner** — `vitest` + `happy-dom` + `@testing-library/react` + `@vitest/coverage-v8` added.
- **Test config** — new `vitest.config.ts` with `@` alias resolution and focused coverage include list for core business-logic files.
- **Comprehensive test suite** — added `tests/` tree:
  - Unit tests: cron, chat utils, gateway client/store, sessions utils, tool policy, device auth, formatting, text direction, agent status/utils, config utils.
  - Integration tests: `use-chat` hook behavior.
- **NPM scripts** — `test`, `test:watch`, `test:coverage` added to `package.json`.

### Changed

#### CI/CD
- **GitHub Actions** — CI now runs `npm test` after `knip` and before `build`.

#### Build/Repo Hygiene
- **Coverage artifacts** — added `coverage` to `.gitignore`.

#### Gateway Client Types & Behavior
- **`GatewayClientOptions`** — added `connectFallbackMs?: number` to support deterministic connect-fallback timing in tests.
- **`GatewayClient.sendConnectSoon()`** — fallback timer now respects `opts.connectFallbackMs` (defaults to existing constant when not provided).

#### Chat Utilities
- **`stripThinkingTags` export** — made public for direct unit testing of parser edge cases.

### Fixed

#### Chat Core (`use-chat.ts`)
- **handleLoadMore streaming guard** — early return when `chat.runId !== null` prevents message list corruption during active streaming (was: load-more replaced optimistic + stream placeholder messages → duplicate messages)
- **handleRetry busy guard** — added `isBusyRef.current` check; prevents parallel `chat.send` calls during active streaming
- **handleAbort per-frame re-render** — uses `runIdRef.current` instead of `chat.runId` closure; deps reduced to `[client, selectedSession]`; eliminates callback re-creation on every streaming delta
- **handleRetry consolidation** — refactored to call `executeSend` instead of duplicating try/catch/request logic; removed fragile `finally` block (double setState on error path)
- **Blob URL leak on image compression failure** — `preview` hoisted above try block; `URL.revokeObjectURL(preview)` called in catch
- **Settings schema migration** — `localStorage` settings merged with `DEFAULT_CHAT_SETTINGS` constant; missing fields from older schema get correct defaults instead of `undefined`

#### Chat Utilities (`chat/utils.ts`)
- **Thinking block extraction** — `extractThinking` now collects all thinking blocks and joins with `\n\n` (was: only first block, `break` on match)
- **Stateful regex footgun** — removed `/g` flag from module-level `FILE_BLOCK_RE` constant; added at call sites via `new RegExp(source, 'g')`
- **Floating-point quality guard** — compression loop guard changed from `> 0.3` to `> 0.31`; avoids one extra compression pass from `0.30000000000000004 > 0.3`
- **generateId uniqueness** — fallback (no `crypto.randomUUID`) now uses `crypto.getRandomValues` hex; final fallback adds `Math.random()` suffix to `Date.now()` for same-millisecond uniqueness
- **replaceAll with /g regex** — changed redundant `replaceAll(new RegExp(..., 'g'))` to `replace(new RegExp(..., 'g'))`

#### Gateway Store (`gateway-store.ts`)
- **Timer leak across connection cycles** — compaction/fallback timer handles stored in module-level variables; `clearStatusTimers()` called in `disconnect()`; previous timers cleared before scheduling new ones
- **Silent eager-fetch errors** — added `log.warn` for non-scope/permission errors in `connect()` catch block
- **Stale run indicator** — increased `STALE_RUN_MAX_AGE_MS` from 30s to 120s; matches Gateway's minimum agent timeout for tool-heavy runs
- **Event handler indirection** — `STORE_EVENT_HANDLERS` uses direct function references instead of arrow wrappers

#### Gateway Client (`client.ts`)
- **Reconnect jitter** — `secureRandomUnit` fallback changed from deterministic `0.5` to `Math.random()`; prevents thundering herd when `crypto.getRandomValues` unavailable
- **Binary encoding APIs** — reverted `codePointAt`/`fromCodePoint` to `charCodeAt`/`fromCharCode` in `device-identity.ts`; correct API for binary byte data (0-255)

#### Server (`server/index.ts`)
- **Removed `openBrowser`** — deleted auto-browser-open feature (`--open` / `-o` CLI flag, `CK_OPEN_BROWSER` env, `spawn` import, Windows `cmd.exe` code path)

### Changed

#### Code Quality
- **Complexity reduction** — `stripThinkingTags` rewritten from regex state machine to manual parser (smaller functions, no global regex state); component JSX ternaries pre-computed as variables
- **Type safety** — `window.__CK_CONFIG__` access replaced with typed `getRuntimeConfig()` helper; `navigator` access via `getBrowserNavigator()` with `NavigatorWithUAData` type; `(navigator as any)` eliminated
- **Index keys eliminated** — array index keys replaced with content-based stable keys in `bubble.tsx`, `session-sidebar.tsx`; IIFE pattern refactored to pre-computed `keyedImages`/`keyedFiles`
- **Base64 overhead comment** — documented `TARGET_SIZE * 1.37` as `// Base64 overhead ratio (~4/3)`

#### Deduplication
- **`extractAgentId` / `sessionLabel`** — deleted from `chat/utils.ts`; `sessionLabel` added to `sessions/utils.ts`; imports updated in `use-chat.ts` and `chat/index.tsx`
- **Unused `_settings` param** — removed from `groupMessages`; `ChatSettings` import removed from `chat/utils.ts`

#### Comment Cleanup
- Removed 31 low-value comments (obvious restatements, redundant separator labels, self-documenting component names) across 16 files; preserved all security, protocol, and domain rationale comments

---

## [2026.2.25] — 2026.2.25

### Added


#### Web Search `/search`
- **Web Search page** — new route `/search`; nav item (Search icon) in sidebar; wrapped with `PageErrorBoundary`
- **Provider Status Bar** — 4 tiles from `config.get`: Active Provider (accent only when *that* provider's key is configured), Model, Cache TTL, Keys Configured (n/5 from config-stored keys only; full env-var detection)
- **Provider Cards** — 5 cards for all supported providers: `brave · perplexity · grok · gemini · kimi`; configured status from `config.get`; active badge; env var name shown; Perplexity card notes OpenRouter `baseUrl` override
- **Model Selector** — shown when active provider has a model field; Perplexity: 3 preset buttons (sonar / sonar-pro / sonar-reasoning-pro); Grok / Gemini / Kimi: free-form text input with documented default as placeholder; saves via `config.patch` merge; re-syncs when config refreshes externally
- **Search Playground** — agent dropdown (from gateway store) + session dropdown (filtered by agent); query input + result count (1 / 3 / 5 / 10); CLI equivalent preview with copy button; runs search via `chat.send` (not `chat.inject` — which does not trigger agent processing); streams response via Gateway `chat` broadcast events; result panel shows status badge · provider · agent · duration and renders response as markdown (same renderer as `/chat`)
- **No-provider warning banner** — shown when zero API keys are set in config; includes setup guide link
- **`PROVIDER_LIST`** constant in `search/types.ts` — single source of truth for the 5-provider ordered list; used by provider cards, warning banner, and status bar
- **Load error state** — inline error panel when `config.get` fails on initial load (instead of blank page); `loadError` tracked in `useSearchConfig`
- **Gateway types** — `WebSearchProvider`, `WebSearchConfig`, `PlaygroundState` added to `src/app/search/types.ts`

#### Browser `/browser`
- **Browser page** — new route `/browser`; nav item (Globe) in sidebar
- **Browser Status card** — probes `browser.request GET /` on load; shows Running · CDP Ready · Profile · Browser tiles; disabled state (browser control off) with docs link
- **Request Panel** — method selector (GET/POST/DELETE) · path input · query JSON textarea · body JSON textarea (POST only) · Send button → `browser.request`; preset buttons for common routes
- **Response viewer** — shows success (200 OK) or error with JSON-prettified body; updates on every send
- **History** — last 20 requests (newest-first) with method · path · status · duration; click any entry to restore into panel
- **Gateway types** — `BrowserStatus` added to `gateway/types.ts`

#### Audio `/audio`
- **Audio page** — new route `/audio` with `PageErrorBoundary`; nav item (Volume2) in sidebar
- **TTS Status card** — enabled toggle via `tts.enable` / `tts.disable`; auto-mode display (read-only; Enable → always, Disable → off); provider fallback chain; API key status for OpenAI, ElevenLabs, Edge TTS
- **TTS Providers section** — provider cards from `tts.providers`; expand to show models and voices; "Set Active" via `tts.setProvider`; active provider highlighted
- **Voice Sample Lab** — text presets + textarea → `tts.convert { text }` → shows provider, format, and server-side output path (browser playback requires backend)
- **Wake Word card** — triggers list from `voicewake.get`; inline add/remove + save via `voicewake.set { triggers }`
- **Talk Config card** — read-only display from `talk.config`: voiceId, modelId, outputFormat, interruptOnSpeech, voiceAliases, seamColor; empty state with setup guide link
- **Slash commands accordion** — reference panel for `/tts` slash commands (collapsed by default)
- **Gateway types** — `TtsAutoMode`, `TtsStatus`, `TtsProvider`, `TtsProvidersResult`, `TtsConvertResult`, `TalkConfigPayload`, `TalkConfigResult`, `VoiceWakeResult` added to `gateway/types.ts`

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

#### Backend Foundation
- **Hono server** — new `server/index.ts` compiled via esbuild to `bin/server.mjs` (12.7 KB); `bin/clawkernel.mjs` now spawns the Hono server instead of running its own `http.createServer`; config passed via `CK_*` environment variables; dev mode auto-reads `~/.clawkernel.json` when env vars are absent
- **SQLite database** — `better-sqlite3` + Drizzle ORM; `~/.clawkernel.db` created on startup with WAL journal mode; three tables: `preferences` (key-value UI settings), `token_alarms` , `usage_history`
- **API routes:**
  - `GET /api/health` — server health (`{ ok, version, uptime }`)
  - `GET /api/version` — checks `registry.npmjs.org/clawkernel/latest` for updates; 1-hour in-memory cache; returns `{ current, latest, updateAvailable, isDismissed }`
  - `POST /api/version/dismiss` — persists dismissed version in preferences table; Zod-validated input (`{ version: string }`)
  - `POST /api/gateway/restart` — runs `openclaw gateway restart` via `child_process.execFile` with 35s timeout
  - `GET /api/prefs` — returns managed preferences as key → value map
  - `PATCH /api/prefs` — updates preferences; Zod `.strict()` schema rejects unrecognized keys; allowed keys: `auto_restart_gateway`, `dismissed_update_version`
  - `POST /api/channels/setup` — stub (501) pending CLI API verification
- **API auth** — optional `CK_API_TOKEN` env var; when set, all mutating endpoints (`POST`/`PATCH`) require `Authorization: Bearer <token>` header; GET endpoints remain public; auth status shown in server startup banner
- **Async static file serving** — `fs/promises` (`readFile` + `stat`) in request handler; sync I/O only at startup; path traversal protection via `path.resolve` + `startsWith(DIST)` guard
- **Dev fallback page** — when `dist/index.html` is missing (e.g. `npm run dev:server` before build), serves a minimal HTML page with clear instructions instead of crashing
- **Update Banner** — dismissible banner in app layout when a newer ClawKernel version is available on npm; persists dismissed version server-side; 1-hour localStorage cache on the client; uses theme `primary` color tokens
- **Restart Bar** — announcement bar using theme `warning` color tokens; triggered via `useRestartBarStore.getState().show()` from any component after config changes requiring manual restart; calls `POST /api/gateway/restart`; auto-hides on success; dismiss button for manual close
- **Dev experience:**
  - `npm run dev` runs both Vite (`:5173`) and Hono (`:4174`) via `concurrently`; Vite proxies `/api/*` to the Hono backend
  - Vite plugin injects `window.__CK_CONFIG__` from `~/.clawkernel.json` during dev (production injection done by `bin/server.mjs`)
  - Dev mode: Hono prints a single dim line (`API server ready on ... (proxied by Vite)`) instead of the full production banner
  - Dev mode: non-API requests to `:4174` redirect to Vite `:5173` — prevents accidental use of the wrong port and losing HMR
- **TypeScript server config** — `tsconfig.server.json` added to project references; `tsc -b` and `npm run typecheck` now validate both frontend and server code
- **Biome + Knip** — `npm run check` and `npm run knip` now include `server/` directory
- **`engines.node`** updated from `>=18` to `>=20` — aligns with `better-sqlite3` v12 pre-built binary support
- **Dependencies:** `hono`, `@hono/node-server`, `better-sqlite3`, `drizzle-orm`, `zod` (runtime); `@types/better-sqlite3`, `drizzle-kit`, `esbuild`, `tsx`, `concurrently` (dev)

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

### Fixed

#### Code Quality
- **`cronToHuman`** (`lib/cron.ts`) — extracted 7 named pattern-matcher functions (`matchEveryNMinutes`, `matchEveryNHours`, …, `matchSingleWeekday`); main function now delegates via a matchers array — complexity 28 → 4
- **`JobCard`** (`cron/job-card.tsx`) — extracted `statusDotClass`, `lastStatusClass`, `lastStatusLabel`, `tileStatusClass`; removes all nested status ternaries from render — complexity 32 → ~12
- **`AgentChannels / ChannelCard`** (`agent-channels.tsx`) — extracted `channelBorderClass`, `iconBoxClass`, `barClass`, `dotClass`; eliminates repeated 3-branch ternaries — complexity 23 → ~8
- **`AgentActivity`** (`agent-activity.tsx`) — extracted `fetchJobRuns` async helper; flattens Promise chain from 5 nesting levels to 2; resolves S2004 (nested functions > 4 levels)
- **`ChatBubble`** (`chat/components/bubble.tsx`) — extracted `resolveDisplayContent`; removes complex multi-`&&` guard from render function — complexity 17 → ~10
- **`ChatPage` keyboard handler** (`chat/index.tsx`) — extracted `handleEscapeKey(ctx)` with typed `EscapeContext`; removes 4-level nesting from `useEffect` — complexity 17 → 3
- **`AgentComparison / getAgentData`** (`agent-comparison.tsx`) — extracted `computeAgentStatus`; replaces 3-level nested ternary with 4 clear early-return branches — complexity 18 → ~12
- **`AgentOverview / isDirty`** (`agent-overview.tsx`) — IIFE `(() => {...})()` converted to `useMemo` with explicit dependency array — complexity 19 → ~14
- **`DmPairingQueue`** (`channels/dm-pairing-queue.tsx`) — extracted `collectDmRequests(channels)`; moves triple-nested loop out of component body — complexity 16 → ~6
- **`sendRequest`** (`browser/hooks/use-browser.ts`) — extracted `tryParseJson(raw, errorMessage)`; removes two try/catch blocks from the main request function — complexity 16 → ~11
- **`parseIdentityMd`** (`agents/dialogs/edit-identity-dialog.tsx`) — replaced 6 sequential `if (label === '...')` assignments with a `IDENTITY_FIELD_MAP` lookup table — complexity 17 → ~5
- **`buildSessionTree`** (`sessions/utils.ts`) — extracted `findParentKey(s, keySet)`; reduces 3-level nesting to 2 — complexity 17 → ~12
- **`useChatToast` navigate** (`hooks/use-chat-toast.ts`) — `{ void navigate('/chat') }` simplified to `{ navigate('/chat') }` — removes S3735 void operator warning
- **`readonly` props** — all component props types and interfaces across 84 files now explicitly mark every property as `readonly`; prevents accidental mutation and makes data flow intent clear at the type level
- **Re-export syntax** (`audio/types.ts`, `browser/types.ts`) — `import { X } from '…'` + `export { X }` pairs replaced with direct `export { X } from '…'`
- **Redundant type assertions removed** — 11 unnecessary `as SomeType` casts removed across `agents/`, `chat/`, `cron/`, `audio/` files; TypeScript already inferred the correct types
- **`Number.parseInt`** (`tts-settings-card.tsx`) — `parseInt(…, 10)` replaced with `Number.parseInt(…, 10)`

#### Sessions
- **`uniqueAgents` sort** (`use-sessions-page.ts`) — `.sort()` replaced with `.sort((a, b) => a.localeCompare(b))`; previous call produced locale-inconsistent ordering across environments

#### Chat
- **`flushQueueRef` type mismatch** (`use-chat.ts`) — `flushQueueRef` is typed as `() => void` but `flushQueue` is `async`; assignment now wraps with `() => { void flushQueue() }` to discard the Promise intentionally and satisfy the type contract
- **`useChatToast` navigate in void context** (`use-chat-toast.ts`) — `onClick: () => navigate('/chat')` returned the `Promise<void>` from react-router v7's `navigate`; fixed to `() => { void navigate('/chat') }` to explicitly discard the return value

#### Agents
- **`normalizeAgentId` regex precedence** (`agents/utils.ts`) — `/^-|-$/g` has ambiguous operator precedence; replaced with `/(?:^-|-$)/g` to make intent explicit
- **`parseIdentityMd` regex precedence** (`edit-identity-dialog.tsx`) — `/^[*_]+|[*_]+$/g` has the same ambiguity; replaced with `/(?:^[*_]+|[*_]+$)/g`

#### Cron
- **`job-card` click wrapper** (`job-card.tsx`) — stopPropagation `<div>` now includes `onKeyDown` + `role="none"`; removed two `biome-ignore` a11y suppressions that were masking the missing keyboard handler

#### Gateway Client
- **`GatewayClient` readonly members** (`gateway/client.ts`) — five class members (`pending`, `listeners`, `onOpen`, `onClose`, `onMessage`) are never reassigned after construction; marked `readonly` to prevent accidental mutation and surface the invariant in the type system

#### UI Components
- **`PromptInput` click wrapper** (`prompt-input.tsx`) — click-to-focus `<div>` now includes a proper `handleKeyDown` (focuses textarea on Enter/Space) + `role="none"`; removed `biome-ignore` a11y suppressions; `handleChange` wrapped in `useCallback([onValueChange])` for stable identity; Context value wrapped in `useMemo` to avoid a new object reference on every render
- **`ConfirmDialog` void operator** (`confirm-dialog.tsx`) — `void onConfirm()` simplified to `onConfirm()`; `onConfirm` is typed `() => void | Promise<void>` so the explicit `void` operator was redundant

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
