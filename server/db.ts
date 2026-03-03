// ---------------------------------------------------------------------------
//  ClawKernel — Database
//
//  SQLite via better-sqlite3 + Drizzle ORM.
//  DB file: ~/.clawkernel.db
//  Tables are created with IF NOT EXISTS — no migrations needed.
// ---------------------------------------------------------------------------

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

  return drizzle(sqlite, { schema })
}

const schema = { preferences, tokenAlarms, usageHistory }

export const db = initDb()
