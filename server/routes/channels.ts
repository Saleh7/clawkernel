import type { Context } from 'hono'

/**
 * POST /api/channels/setup — CLI-based channel setup (IRC, Mattermost, iMessage).
 *
 * Stub — the exact openclaw CLI command for channel setup is not yet confirmed.
 * Deferred until the CLI API is verified against OpenClaw source.
 */
export function handleChannelsSetup(c: Context): Response {
  return c.json({ ok: false, error: 'Not implemented — CLI-based channel setup is pending' }, 501) as Response
}
