import type { Context } from 'hono'
import { z } from 'zod'
import { getPref, setPref } from '../lib/prefs'
import { compareVersions, normalizeVersion } from '../lib/version'

const DismissSchema = z.object({
  version: z.string().min(1, 'version is required'),
})

const REGISTRY_URL = 'https://registry.npmjs.org/clawkernel/latest'

/** In-memory cache — avoids hammering the npm registry on every page load. */
let versionCache: { latest: string; fetchedAt: number } | null = null
const CACHE_TTL_MS = 60 * 60 * 1_000

/** GET /api/version — checks npm registry for ClawKernel updates. */
export async function handleVersionGet(c: Context): Promise<Response> {
  const current = normalizeVersion(process.env.CK_VERSION ?? '')
  const dismissed = getPref('dismissed_update_version') ?? ''

  let latest: string | null = null
  let fetchError: string | null = null

  if (versionCache && Date.now() - versionCache.fetchedAt < CACHE_TTL_MS) {
    latest = versionCache.latest
  } else {
    try {
      const res = await fetch(REGISTRY_URL, { signal: AbortSignal.timeout(5_000) })
      if (!res.ok) throw new Error(`Registry responded ${res.status}`)
      const data = (await res.json()) as { version?: string }
      latest = normalizeVersion(data.version ?? '')
      versionCache = { latest, fetchedAt: Date.now() }
    } catch (err) {
      fetchError = String(err)
    }
  }

  const updateAvailable = !!current && !!latest && compareVersions(latest, current) > 0
  const isDismissed = !!latest && dismissed === latest

  return c.json({ current: current || null, latest, updateAvailable, isDismissed, error: fetchError })
}

/** POST /api/version/dismiss — marks a specific version as dismissed. */
export async function handleVersionDismiss(c: Context): Promise<Response> {
  const result = DismissSchema.safeParse(await c.req.json())
  if (!result.success) {
    return c.json({ ok: false, error: result.error.issues[0]?.message ?? 'Invalid request' }, 400) as Response
  }
  setPref('dismissed_update_version', normalizeVersion(result.data.version))
  return c.json({ ok: true })
}
