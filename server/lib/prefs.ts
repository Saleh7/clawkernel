import { eq } from 'drizzle-orm'
import { db, preferences } from '../db'

const now = (): number => Math.floor(Date.now() / 1000)

export function getPref(key: string): string | null {
  const row = db.select({ value: preferences.value }).from(preferences).where(eq(preferences.key, key)).get()
  return row?.value ?? null
}

export function setPref(key: string, value: string): void {
  db.insert(preferences)
    .values({ key, value, updatedAt: now() })
    .onConflictDoUpdate({
      target: preferences.key,
      set: { value, updatedAt: now() },
    })
    .run()
}
