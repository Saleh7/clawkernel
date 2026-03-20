// SQLite database at ~/.clawkernel.db. Tables are created with IF NOT EXISTS, so no migrations are required.

import crypto from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

const DB_PATH = path.join(os.homedir(), '.clawkernel.db')

/** Key-value store for UI preferences (dismissed update version, auto-restart, etc.) */
export const preferences = sqliteTable('preferences', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

/** Token usage alarms — alert when a model/timeline exceeds a token limit. (Phase 8) */
const tokenAlarms = sqliteTable('token_alarms', {
  id: text('id').primaryKey(),
  model: text('model').notNull(),
  /** '1h' | '24h' | '7d' */
  timeline: text('timeline').notNull(),
  tokenLimit: integer('token_limit').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

/** Historical usage cache — supplements Gateway's in-memory usage data. (Phase 8) */
const usageHistory = sqliteTable('usage_history', {
  id: text('id').primaryKey(),
  ts: integer('ts').notNull(),
  agentId: text('agent_id').notNull(),
  model: text('model').notNull(),
  inputTokens: integer('input_tokens').notNull(),
  outputTokens: integer('output_tokens').notNull(),
  costUsd: real('cost_usd').notNull(),
})

export const promptCategories = sqliteTable('prompt_categories', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at').notNull(),
})

export const prompts = sqliteTable('prompts', {
  id: text('id').primaryKey(),
  categoryId: text('category_id').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  usageCount: integer('usage_count').notNull().default(0),
  lastUsedAt: integer('last_used_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

function initDb() {
  const sqlite = new Database(DB_PATH)
  sqlite.pragma('journal_mode = WAL')

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS preferences (
      key        TEXT    PRIMARY KEY,
      value      TEXT    NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)

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
  `)

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
  `)

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS prompt_categories (
      id         TEXT    PRIMARY KEY,
      name       TEXT    NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    )
  `)

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
  `)

  seedDefaultCategories(sqlite)

  return drizzle(sqlite, { schema })
}

function seedDefaultCategories(sqlite: Database.Database) {
  const count = sqlite.prepare('SELECT COUNT(*) as n FROM prompt_categories').get() as { n: number }
  if (count.n > 0) return
  const now = Math.floor(Date.now() / 1000)
  const defaults = ['General', 'Development', 'Operations', 'Research', 'Writing']
  const stmt = sqlite.prepare('INSERT INTO prompt_categories (id, name, sort_order, created_at) VALUES (?, ?, ?, ?)')
  for (let i = 0; i < defaults.length; i++) {
    stmt.run(crypto.randomUUID(), defaults[i], i, now)
  }
}

const schema = { preferences, tokenAlarms, usageHistory, promptCategories, prompts }

export const db = initDb()
