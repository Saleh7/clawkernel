import crypto from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import { db, promptCategories, prompts } from '../db'

const now = (): number => Math.floor(Date.now() / 1000)

export type PromptRow = typeof prompts.$inferSelect
export type CategoryRow = typeof promptCategories.$inferSelect

export function listCategories(): CategoryRow[] {
  return db.select().from(promptCategories).orderBy(promptCategories.sortOrder).all()
}

export function createCategory(name: string): CategoryRow {
  const maxOrder = db.select({ max: sql<number>`COALESCE(MAX(sort_order), -1)` }).from(promptCategories).get()
  const entry = {
    id: crypto.randomUUID(),
    name: name.trim(),
    sortOrder: (maxOrder?.max ?? -1) + 1,
    createdAt: now(),
  }
  db.insert(promptCategories).values(entry).run()
  return entry
}

export function updateCategory(id: string, name: string): void {
  db.update(promptCategories).set({ name: name.trim() }).where(eq(promptCategories.id, id)).run()
}

export function deleteCategory(id: string): { deleted: number } {
  db.delete(prompts).where(eq(prompts.categoryId, id)).run()
  const result = db.delete(promptCategories).where(eq(promptCategories.id, id)).run()
  return { deleted: result.changes }
}

export function reorderCategories(ids: string[]): void {
  for (let i = 0; i < ids.length; i++) {
    db.update(promptCategories).set({ sortOrder: i }).where(eq(promptCategories.id, ids[i])).run()
  }
}

export function listPrompts(): PromptRow[] {
  return db.select().from(prompts).orderBy(prompts.sortOrder).all()
}

export function createPrompt(data: { categoryId: string; title: string; content: string }): PromptRow {
  const maxOrder = db
    .select({ max: sql<number>`COALESCE(MAX(sort_order), -1)` })
    .from(prompts)
    .where(eq(prompts.categoryId, data.categoryId))
    .get()
  const entry: PromptRow = {
    id: crypto.randomUUID(),
    categoryId: data.categoryId,
    title: data.title.trim(),
    content: data.content.trim(),
    pinned: false,
    sortOrder: (maxOrder?.max ?? -1) + 1,
    usageCount: 0,
    lastUsedAt: null,
    createdAt: now(),
    updatedAt: now(),
  }
  db.insert(prompts).values(entry).run()
  return entry
}

type PromptUpdate = Partial<typeof prompts.$inferInsert>

export function updatePrompt(
  id: string,
  data: Partial<{ title: string; content: string; categoryId: string; pinned: boolean }>,
): { changes: number } {
  const set: PromptUpdate = { updatedAt: now() }
  if (data.title !== undefined) set.title = data.title.trim()
  if (data.content !== undefined) set.content = data.content.trim()
  if (data.categoryId !== undefined) set.categoryId = data.categoryId
  if (data.pinned !== undefined) set.pinned = data.pinned
  return db.update(prompts).set(set).where(eq(prompts.id, id)).run()
}

export function deletePrompt(id: string): { changes: number } {
  return db.delete(prompts).where(eq(prompts.id, id)).run()
}

export function recordUsage(id: string): { changes: number } {
  return db
    .update(prompts)
    .set({ usageCount: sql`usage_count + 1`, lastUsedAt: now(), updatedAt: now() })
    .where(eq(prompts.id, id))
    .run()
}

export function reorderPrompts(ids: string[]): void {
  for (let i = 0; i < ids.length; i++) {
    db.update(prompts).set({ sortOrder: i }).where(eq(prompts.id, ids[i])).run()
  }
}

export type ExportData = {
  version: 1
  categories: CategoryRow[]
  prompts: PromptRow[]
}

export function exportAll(): ExportData {
  return {
    version: 1,
    categories: listCategories(),
    prompts: listPrompts(),
  }
}

export function importAll(data: ExportData): { categories: number; prompts: number } {
  let catCount = 0
  let promptCount = 0
  const ts = now()
  const categoryIdMap = new Map<string, string>()

  for (const cat of data.categories) {
    const newId = crypto.randomUUID()
    categoryIdMap.set(cat.id, newId)
    db.insert(promptCategories).values({ id: newId, name: cat.name, sortOrder: cat.sortOrder, createdAt: ts }).run()
    catCount++
  }

  for (const p of data.prompts) {
    const mappedCategoryId = categoryIdMap.get(p.categoryId)
    if (!mappedCategoryId) continue
    db.insert(prompts)
      .values({
        id: crypto.randomUUID(),
        categoryId: mappedCategoryId,
        title: p.title,
        content: p.content,
        pinned: p.pinned,
        sortOrder: p.sortOrder,
        usageCount: 0,
        lastUsedAt: null,
        createdAt: ts,
        updatedAt: ts,
      })
      .run()
    promptCount++
  }

  return { categories: catCount, prompts: promptCount }
}
