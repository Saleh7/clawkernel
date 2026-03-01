/**
 * Shared session timing constants.
 * All values are in milliseconds.
 */

/** A session updated within this window is considered "active" (5 minutes). */
export const ACTIVE_SESSION_MS = 300_000

/** A session not updated within this window is considered "stale" (24 hours). */
export const STALE_SESSION_MS = 86_400_000
