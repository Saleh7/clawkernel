import type { Context } from 'hono'
import { z } from 'zod'
import { getPref, setPref } from '../lib/prefs'

// ---------------------------------------------------------------------------
//  Schema
//  .strict() rejects any keys not in the schema — prevents writing arbitrary
//  data to the preferences table from the frontend.
// ---------------------------------------------------------------------------

const PrefsSchema = z
  .object({
    auto_restart_gateway: z.string().optional(),
    dismissed_update_version: z.string().optional(),
  })
  .strict()

/** GET /api/prefs — returns all managed preferences as a key → value map. */
export function handlePrefsGet(c: Context): Response {
  return c.json({
    auto_restart_gateway: getPref('auto_restart_gateway'),
    dismissed_update_version: getPref('dismissed_update_version'),
  })
}

/** PATCH /api/prefs — updates one or more managed preferences. */
export async function handlePrefsPatch(c: Context): Promise<Response> {
  const result = PrefsSchema.safeParse(await c.req.json())
  if (!result.success) {
    return c.json({ ok: false, error: result.error.issues[0]?.message ?? 'Invalid request' }, 400) as Response
  }
  for (const [key, value] of Object.entries(result.data)) {
    if (value !== undefined) setPref(key, value)
  }
  return c.json({ ok: true })
}
