import type { Context } from 'hono'
import { execOpenClaw } from '../lib/exec-openclaw'

/** POST /api/gateway/restart — runs `openclaw gateway restart` via child_process. */
export async function handleGatewayRestart(c: Context): Promise<Response> {
  try {
    const out = await execOpenClaw(['gateway', 'restart'], { timeout: 35_000 })
    return c.json({
      ok: true,
      output: `${out.stdout}\n${out.stderr}`.trim(),
    })
  } catch (err) {
    return c.json({ ok: false, error: String(err) }, 500) as Response
  }
}
