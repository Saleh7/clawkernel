// server/index.ts
import { existsSync, readFileSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import os2 from "node:os";
import path2 from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { Hono } from "hono";

// server/routes/channels.ts
function handleChannelsSetup(c) {
  return c.json({ ok: false, error: "Not implemented \u2014 CLI-based channel setup is pending" }, 501);
}

// server/lib/exec-openclaw.ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
var execFileAsync = promisify(execFile);
var OPENCLAW_BIN = "openclaw";
async function execOpenClaw(args, opts = {}) {
  const { timeout = 3e4 } = opts;
  return execFileAsync(OPENCLAW_BIN, args, {
    timeout,
    env: { ...process.env, NO_COLOR: "1" }
  });
}

// server/routes/gateway.ts
async function handleGatewayRestart(c) {
  try {
    const out = await execOpenClaw(["gateway", "restart"], { timeout: 35e3 });
    return c.json({
      ok: true,
      output: `${out.stdout}
${out.stderr}`.trim()
    });
  } catch (err) {
    return c.json({ ok: false, error: String(err) }, 500);
  }
}

// server/routes/health.ts
var startedAt = Date.now();
function handleHealth(c) {
  return c.json({
    ok: true,
    version: process.env.CK_VERSION ?? "unknown",
    uptime: Math.floor((Date.now() - startedAt) / 1e3)
  });
}

// server/routes/prefs.ts
import { z } from "zod";

// server/lib/prefs.ts
import { eq } from "drizzle-orm";

// server/db.ts
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
var DB_PATH = path.join(os.homedir(), ".clawkernel.db");
var preferences = sqliteTable("preferences", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at").notNull()
});
var tokenAlarms = sqliteTable("token_alarms", {
  id: text("id").primaryKey(),
  model: text("model").notNull(),
  /** '1h' | '24h' | '7d' */
  timeline: text("timeline").notNull(),
  tokenLimit: integer("token_limit").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull()
});
var usageHistory = sqliteTable("usage_history", {
  id: text("id").primaryKey(),
  ts: integer("ts").notNull(),
  agentId: text("agent_id").notNull(),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens").notNull(),
  outputTokens: integer("output_tokens").notNull(),
  costUsd: real("cost_usd").notNull()
});
var promptCategories = sqliteTable("prompt_categories", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at").notNull()
});
var prompts = sqliteTable("prompts", {
  id: text("id").primaryKey(),
  categoryId: text("category_id").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  usageCount: integer("usage_count").notNull().default(0),
  lastUsedAt: integer("last_used_at"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull()
});
function initDb() {
  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS preferences (
      key        TEXT    PRIMARY KEY,
      value      TEXT    NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS token_alarms (
      id          TEXT    PRIMARY KEY,
      model       TEXT    NOT NULL,
      timeline    TEXT    NOT NULL,
      token_limit INTEGER NOT NULL,
      enabled     INTEGER NOT NULL DEFAULT 1,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    )
  `);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS usage_history (
      id            TEXT    PRIMARY KEY,
      ts            INTEGER NOT NULL,
      agent_id      TEXT    NOT NULL,
      model         TEXT    NOT NULL,
      input_tokens  INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL,
      cost_usd      REAL    NOT NULL
    )
  `);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS prompt_categories (
      id         TEXT    PRIMARY KEY,
      name       TEXT    NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    )
  `);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS prompts (
      id          TEXT    PRIMARY KEY,
      category_id TEXT    NOT NULL,
      title       TEXT    NOT NULL,
      content     TEXT    NOT NULL,
      pinned      INTEGER NOT NULL DEFAULT 0,
      sort_order  INTEGER NOT NULL DEFAULT 0,
      usage_count INTEGER NOT NULL DEFAULT 0,
      last_used_at INTEGER,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    )
  `);
  seedDefaultCategories(sqlite);
  return drizzle(sqlite, { schema });
}
function seedDefaultCategories(sqlite) {
  const count = sqlite.prepare("SELECT COUNT(*) as n FROM prompt_categories").get();
  if (count.n > 0) return;
  const now3 = Math.floor(Date.now() / 1e3);
  const defaults = ["General", "Development", "Operations", "Research", "Writing"];
  const stmt = sqlite.prepare("INSERT INTO prompt_categories (id, name, sort_order, created_at) VALUES (?, ?, ?, ?)");
  for (let i = 0; i < defaults.length; i++) {
    stmt.run(crypto.randomUUID(), defaults[i], i, now3);
  }
}
var schema = { preferences, tokenAlarms, usageHistory, promptCategories, prompts };
var db = initDb();

// server/lib/prefs.ts
var now = () => Math.floor(Date.now() / 1e3);
function getPref(key) {
  const row = db.select({ value: preferences.value }).from(preferences).where(eq(preferences.key, key)).get();
  return row?.value ?? null;
}
function setPref(key, value) {
  db.insert(preferences).values({ key, value, updatedAt: now() }).onConflictDoUpdate({
    target: preferences.key,
    set: { value, updatedAt: now() }
  }).run();
}

// server/routes/prefs.ts
var PrefsSchema = z.object({
  auto_restart_gateway: z.string().optional(),
  dismissed_update_version: z.string().optional()
}).strict();
function handlePrefsGet(c) {
  return c.json({
    auto_restart_gateway: getPref("auto_restart_gateway"),
    dismissed_update_version: getPref("dismissed_update_version")
  });
}
async function handlePrefsPatch(c) {
  const result = PrefsSchema.safeParse(await c.req.json());
  if (!result.success) {
    return c.json({ ok: false, error: result.error.issues[0]?.message ?? "Invalid request" }, 400);
  }
  for (const [key, value] of Object.entries(result.data)) {
    if (value !== void 0) setPref(key, value);
  }
  return c.json({ ok: true });
}

// server/lib/prompts.ts
import crypto2 from "node:crypto";
import { eq as eq2, sql } from "drizzle-orm";
var now2 = () => Math.floor(Date.now() / 1e3);
function listCategories() {
  return db.select().from(promptCategories).orderBy(promptCategories.sortOrder).all();
}
function createCategory(name) {
  const maxOrder = db.select({ max: sql`COALESCE(MAX(sort_order), -1)` }).from(promptCategories).get();
  const entry = {
    id: crypto2.randomUUID(),
    name: name.trim(),
    sortOrder: (maxOrder?.max ?? -1) + 1,
    createdAt: now2()
  };
  db.insert(promptCategories).values(entry).run();
  return entry;
}
function updateCategory(id, name) {
  db.update(promptCategories).set({ name: name.trim() }).where(eq2(promptCategories.id, id)).run();
}
function deleteCategory(id) {
  db.delete(prompts).where(eq2(prompts.categoryId, id)).run();
  const result = db.delete(promptCategories).where(eq2(promptCategories.id, id)).run();
  return { deleted: result.changes };
}
function reorderCategories(ids) {
  for (let i = 0; i < ids.length; i++) {
    db.update(promptCategories).set({ sortOrder: i }).where(eq2(promptCategories.id, ids[i])).run();
  }
}
function listPrompts() {
  return db.select().from(prompts).orderBy(prompts.sortOrder).all();
}
function createPrompt(data) {
  const maxOrder = db.select({ max: sql`COALESCE(MAX(sort_order), -1)` }).from(prompts).where(eq2(prompts.categoryId, data.categoryId)).get();
  const entry = {
    id: crypto2.randomUUID(),
    categoryId: data.categoryId,
    title: data.title.trim(),
    content: data.content.trim(),
    pinned: false,
    sortOrder: (maxOrder?.max ?? -1) + 1,
    usageCount: 0,
    lastUsedAt: null,
    createdAt: now2(),
    updatedAt: now2()
  };
  db.insert(prompts).values(entry).run();
  return entry;
}
function updatePrompt(id, data) {
  const set = { updatedAt: now2() };
  if (data.title !== void 0) set.title = data.title.trim();
  if (data.content !== void 0) set.content = data.content.trim();
  if (data.categoryId !== void 0) set.categoryId = data.categoryId;
  if (data.pinned !== void 0) set.pinned = data.pinned;
  return db.update(prompts).set(set).where(eq2(prompts.id, id)).run();
}
function deletePrompt(id) {
  return db.delete(prompts).where(eq2(prompts.id, id)).run();
}
function recordUsage(id) {
  return db.update(prompts).set({ usageCount: sql`usage_count + 1`, lastUsedAt: now2(), updatedAt: now2() }).where(eq2(prompts.id, id)).run();
}
function reorderPrompts(ids) {
  for (let i = 0; i < ids.length; i++) {
    db.update(prompts).set({ sortOrder: i }).where(eq2(prompts.id, ids[i])).run();
  }
}
function exportAll() {
  return {
    version: 1,
    categories: listCategories(),
    prompts: listPrompts()
  };
}
function importAll(data) {
  let catCount = 0;
  let promptCount = 0;
  const ts = now2();
  const categoryIdMap = /* @__PURE__ */ new Map();
  for (const cat of data.categories) {
    const newId = crypto2.randomUUID();
    categoryIdMap.set(cat.id, newId);
    db.insert(promptCategories).values({ id: newId, name: cat.name, sortOrder: cat.sortOrder, createdAt: ts }).run();
    catCount++;
  }
  for (const p of data.prompts) {
    const mappedCategoryId = categoryIdMap.get(p.categoryId);
    if (!mappedCategoryId) continue;
    db.insert(prompts).values({
      id: crypto2.randomUUID(),
      categoryId: mappedCategoryId,
      title: p.title,
      content: p.content,
      pinned: p.pinned,
      sortOrder: p.sortOrder,
      usageCount: 0,
      lastUsedAt: null,
      createdAt: ts,
      updatedAt: ts
    }).run();
    promptCount++;
  }
  return { categories: catCount, prompts: promptCount };
}

// server/routes/prompts.ts
function handlePromptsGet(c) {
  return c.json({ categories: listCategories(), prompts: listPrompts() });
}
async function handlePromptsCreate(c) {
  const body = await c.req.json();
  if (!body.categoryId || !body.title?.trim() || !body.content?.trim()) {
    return c.json({ ok: false, error: "categoryId, title, and content required" }, 400);
  }
  const prompt = createPrompt({ categoryId: body.categoryId, title: body.title, content: body.content });
  return c.json({ ok: true, prompt });
}
async function handlePromptsUpdate(c) {
  const id = c.req.param("id");
  const body = await c.req.json();
  const result = updatePrompt(id, body);
  if (result.changes === 0) return c.json({ ok: false, error: "Prompt not found" }, 404);
  return c.json({ ok: true });
}
async function handlePromptsDelete(c) {
  const result = deletePrompt(c.req.param("id"));
  if (result.changes === 0) return c.json({ ok: false, error: "Prompt not found" }, 404);
  return c.json({ ok: true });
}
async function handlePromptsUse(c) {
  const result = recordUsage(c.req.param("id"));
  if (result.changes === 0) return c.json({ ok: false, error: "Prompt not found" }, 404);
  return c.json({ ok: true });
}
async function handlePromptsReorder(c) {
  const body = await c.req.json();
  if (!Array.isArray(body.ids)) return c.json({ ok: false, error: "ids array required" }, 400);
  reorderPrompts(body.ids);
  return c.json({ ok: true });
}
function handleCategoriesGet(c) {
  return c.json({ categories: listCategories() });
}
async function handleCategoriesCreate(c) {
  const body = await c.req.json();
  if (!body.name?.trim()) return c.json({ ok: false, error: "name required" }, 400);
  const category = createCategory(body.name);
  return c.json({ ok: true, category });
}
async function handleCategoriesUpdate(c) {
  const id = c.req.param("id");
  const body = await c.req.json();
  if (!body.name?.trim()) return c.json({ ok: false, error: "name required" }, 400);
  updateCategory(id, body.name);
  return c.json({ ok: true });
}
async function handleCategoriesDelete(c) {
  const result = deleteCategory(c.req.param("id"));
  return c.json({ ok: true, ...result });
}
async function handleCategoriesReorder(c) {
  const body = await c.req.json();
  if (!Array.isArray(body.ids)) return c.json({ ok: false, error: "ids array required" }, 400);
  reorderCategories(body.ids);
  return c.json({ ok: true });
}
function handlePromptsExport(c) {
  return c.json(exportAll());
}
async function handlePromptsImport(c) {
  const body = await c.req.json();
  if (body.version !== 1 || !Array.isArray(body.categories) || !Array.isArray(body.prompts)) {
    return c.json({ ok: false, error: "Invalid import format" }, 400);
  }
  const result = importAll(body);
  return c.json({ ok: true, ...result });
}

// server/routes/version.ts
import { z as z2 } from "zod";

// server/lib/version.ts
function normalizeVersion(v) {
  return String(v ?? "").replace(/^v/i, "").trim();
}
function compareVersions(a, b) {
  const parse = (v) => normalizeVersion(v).split(/[.-]/).map(Number).filter((n) => !Number.isNaN(n));
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

// server/routes/version.ts
var DismissSchema = z2.object({
  version: z2.string().min(1, "version is required")
});
var REGISTRY_URL = "https://registry.npmjs.org/clawkernel/latest";
var versionCache = null;
var CACHE_TTL_MS = 60 * 60 * 1e3;
async function handleVersionGet(c) {
  const current = normalizeVersion(process.env.CK_VERSION ?? "");
  const dismissed = getPref("dismissed_update_version") ?? "";
  let latest = null;
  let fetchError = null;
  if (versionCache && Date.now() - versionCache.fetchedAt < CACHE_TTL_MS) {
    latest = versionCache.latest;
  } else {
    try {
      const res = await fetch(REGISTRY_URL, { signal: AbortSignal.timeout(5e3) });
      if (!res.ok) throw new Error(`Registry responded ${res.status}`);
      const data = await res.json();
      latest = normalizeVersion(data.version ?? "");
      versionCache = { latest, fetchedAt: Date.now() };
    } catch (err) {
      fetchError = String(err);
    }
  }
  const updateAvailable = !!current && !!latest && compareVersions(latest, current) > 0;
  const isDismissed = !!latest && dismissed === latest;
  return c.json({ current: current || null, latest, updateAvailable, isDismissed, error: fetchError });
}
async function handleVersionDismiss(c) {
  const result = DismissSchema.safeParse(await c.req.json());
  if (!result.success) {
    return c.json({ ok: false, error: result.error.issues[0]?.message ?? "Invalid request" }, 400);
  }
  setPref("dismissed_update_version", normalizeVersion(result.data.version));
  return c.json({ ok: true });
}

// server/index.ts
var __filename = fileURLToPath(import.meta.url);
var __dirname = path2.dirname(__filename);
var DIST = path2.resolve(__dirname, "..", "dist");
var INDEX_HTML_PATH = path2.join(DIST, "index.html");
function loadLocalConfig() {
  try {
    const raw = readFileSync(path2.join(os2.homedir(), ".clawkernel.json"), "utf8");
    const cfg = JSON.parse(raw);
    if (cfg.gatewayUrl?.startsWith("ws")) return cfg;
  } catch {
  }
  return {};
}
var localCfg = process.env.CK_GATEWAY_URL ? {} : loadLocalConfig();
var PORT = Number(process.env.CK_PORT ?? localCfg.dashboardPort ?? 4173);
var HOST = process.env.CK_HOST ?? "localhost";
var GATEWAY_URL = process.env.CK_GATEWAY_URL ?? localCfg.gatewayUrl ?? "";
var GATEWAY_TOKEN = process.env.CK_GATEWAY_TOKEN ?? localCfg.gatewayToken ?? "";
var OPENCLAW_HOME = process.env.CK_OPENCLAW_HOME ?? localCfg.openclawHome ?? "~/.openclaw";
var API_TOKEN = process.env.CK_API_TOKEN ?? "";
var COLOR = process.stdout.isTTY && !process.env.NO_COLOR;
var clr = COLOR ? { m: "\x1B[95m", g: "\x1B[92m", dim: "\x1B[2m", b: "\x1B[1m", r: "\x1B[0m" } : { m: "", g: "", dim: "", b: "", r: "" };
var DEV_FALLBACK_HTML = `<!DOCTYPE html><html><head><title>ClawKernel</title></head><body>
<pre>dist/index.html not found.

Run: npm run build
Then restart the server.</pre></body></html>`;
function buildInjectedHtml() {
  if (!existsSync(INDEX_HTML_PATH)) {
    console.warn(`
  \u26A0  dist/index.html not found \u2014 serving dev fallback page.`);
    console.warn(`     Run: npm run build
`);
    return Buffer.from(DEV_FALLBACK_HTML);
  }
  const raw = readFileSync(INDEX_HTML_PATH, "utf8");
  return Buffer.from(
    raw.replace(
      "</head>",
      `  <script>window.__CK_CONFIG__=${JSON.stringify({
        gatewayUrl: GATEWAY_URL,
        gatewayToken: GATEWAY_TOKEN,
        openclawHome: OPENCLAW_HOME
      })}</script>
</head>`
    )
  );
}
var injectedHtmlBuffer = buildInjectedHtml();
var MIME_TYPES = /* @__PURE__ */ new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
  [".ico", "image/x-icon"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
  [".ttf", "font/ttf"],
  [".wasm", "application/wasm"],
  [".map", "application/json"]
]);
function requireAuth(c) {
  if (!API_TOKEN) return null;
  const header = c.req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (token !== API_TOKEN) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
var app = new Hono();
var api = new Hono().basePath("/api");
api.get("/health", handleHealth);
api.get("/version", handleVersionGet);
api.get("/prefs", handlePrefsGet);
api.get("/prompts", handlePromptsGet);
api.get("/prompts/export", handlePromptsExport);
api.get("/prompt-categories", handleCategoriesGet);
api.post("/version/dismiss", (c) => {
  const denied = requireAuth(c);
  if (denied) return denied;
  return handleVersionDismiss(c);
});
api.post("/gateway/restart", (c) => {
  const denied = requireAuth(c);
  if (denied) return denied;
  return handleGatewayRestart(c);
});
api.post("/channels/setup", (c) => {
  const denied = requireAuth(c);
  if (denied) return denied;
  return handleChannelsSetup(c);
});
api.patch("/prefs", (c) => {
  const denied = requireAuth(c);
  if (denied) return denied;
  return handlePrefsPatch(c);
});
api.post("/prompts", (c) => {
  const denied = requireAuth(c);
  if (denied) return denied;
  return handlePromptsCreate(c);
});
api.patch("/prompts/:id", (c) => {
  const denied = requireAuth(c);
  if (denied) return denied;
  return handlePromptsUpdate(c);
});
api.delete("/prompts/:id", (c) => {
  const denied = requireAuth(c);
  if (denied) return denied;
  return handlePromptsDelete(c);
});
api.post("/prompts/:id/use", (c) => {
  const denied = requireAuth(c);
  if (denied) return denied;
  return handlePromptsUse(c);
});
api.post("/prompts/reorder", (c) => {
  const denied = requireAuth(c);
  if (denied) return denied;
  return handlePromptsReorder(c);
});
api.post("/prompts/import", (c) => {
  const denied = requireAuth(c);
  if (denied) return denied;
  return handlePromptsImport(c);
});
api.post("/prompt-categories", (c) => {
  const denied = requireAuth(c);
  if (denied) return denied;
  return handleCategoriesCreate(c);
});
api.patch("/prompt-categories/:id", (c) => {
  const denied = requireAuth(c);
  if (denied) return denied;
  return handleCategoriesUpdate(c);
});
api.delete("/prompt-categories/:id", (c) => {
  const denied = requireAuth(c);
  if (denied) return denied;
  return handleCategoriesDelete(c);
});
api.post("/prompt-categories/reorder", (c) => {
  const denied = requireAuth(c);
  if (denied) return denied;
  return handleCategoriesReorder(c);
});
app.route("/", api);
var VITE_DEV_PORT = 5173;
var spaResponse = () => new Response(injectedHtmlBuffer, {
  headers: {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "X-Content-Type-Options": "nosniff",
    "Content-Length": String(injectedHtmlBuffer.length)
  }
});
app.all("*", async (c) => {
  if (IS_DEV) {
    const url2 = new URL(c.req.url);
    return c.redirect(`http://localhost:${VITE_DEV_PORT}${url2.pathname}${url2.search}`);
  }
  const url = new URL(c.req.url);
  const normalized = path2.normalize(url.pathname);
  const filePath = path2.resolve(DIST, `.${normalized}`);
  if (!filePath.startsWith(DIST)) {
    return c.text("Forbidden", 403);
  }
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) return spaResponse();
  } catch {
    return spaResponse();
  }
  const isAsset = normalized.startsWith("/assets/");
  const ext = path2.extname(filePath).toLowerCase();
  const mime = MIME_TYPES.get(ext) ?? "application/octet-stream";
  const data = await readFile(filePath);
  return new Response(data, {
    headers: {
      "Content-Type": mime,
      "Cache-Control": isAsset ? "public, max-age=31536000, immutable" : "no-cache, no-store, must-revalidate",
      "X-Content-Type-Options": "nosniff"
    }
  });
});
var CONFIG_FILE = path2.join(os2.homedir(), ".clawkernel.json");
var displayHost = HOST === "0.0.0.0" ? "localhost" : HOST;
var serverUrl = `http://${displayHost}:${PORT}`;
var IS_DEV = !process.env.CK_VERSION;
serve({ fetch: app.fetch, port: PORT, hostname: HOST }, () => {
  if (IS_DEV) {
    console.log(`  ${clr.dim}API server ready on ${serverUrl} (proxied by Vite)${clr.r}`);
    return;
  }
  console.log(`  ${clr.m}\u{1F99E} ClawKernel${clr.r}
`);
  console.log(`  ${clr.g}\u279C${clr.r}  Local:    ${clr.b}${serverUrl}${clr.r}`);
  if (HOST === "0.0.0.0") {
    console.log(`  ${clr.g}\u279C${clr.r}  Network:  http://<your-ip>:${PORT}`);
  }
  console.log(`  ${clr.g}\u279C${clr.r}  Gateway:  ${GATEWAY_URL}`);
  console.log(`  ${clr.g}\u279C${clr.r}  Config:   ${clr.dim}${CONFIG_FILE}${clr.r}`);
  if (API_TOKEN) {
    console.log(`  ${clr.g}\u279C${clr.r}  Auth:     ${clr.dim}CK_API_TOKEN is set \u2014 mutating endpoints protected${clr.r}`);
  }
  console.log(`
  Press ${clr.dim}Ctrl+C${clr.r} to stop.
`);
});
