import type { Context } from 'hono'

const startedAt = Date.now()

/** GET /api/health — ClawKernel server health (not Gateway health). */
export function handleHealth(c: Context): Response {
  return c.json({
    ok: true,
    version: process.env.CK_VERSION ?? 'unknown',
    uptime: Math.floor((Date.now() - startedAt) / 1000),
  }) as Response
}
