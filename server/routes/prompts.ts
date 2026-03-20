import type { Context } from 'hono'
import {
  createCategory,
  createPrompt,
  deleteCategory,
  deletePrompt,
  type ExportData,
  exportAll,
  importAll,
  listCategories,
  listPrompts,
  recordUsage,
  reorderCategories,
  reorderPrompts,
  updateCategory,
  updatePrompt,
} from '../lib/prompts'

export function handlePromptsGet(c: Context): Response {
  return c.json({ categories: listCategories(), prompts: listPrompts() })
}

export async function handlePromptsCreate(c: Context): Promise<Response> {
  const body = await c.req.json<{ categoryId?: string; title?: string; content?: string }>()
  if (!body.categoryId || !body.title?.trim() || !body.content?.trim()) {
    return c.json({ ok: false, error: 'categoryId, title, and content required' }, 400) as Response
  }
  const prompt = createPrompt({ categoryId: body.categoryId, title: body.title, content: body.content })
  return c.json({ ok: true, prompt })
}

export async function handlePromptsUpdate(c: Context): Promise<Response> {
  const id = c.req.param('id')!
  const body = await c.req.json<{ title?: string; content?: string; categoryId?: string; pinned?: boolean }>()
  const result = updatePrompt(id, body)
  if (result.changes === 0) return c.json({ ok: false, error: 'Prompt not found' }, 404) as Response
  return c.json({ ok: true })
}

export async function handlePromptsDelete(c: Context): Promise<Response> {
  const result = deletePrompt(c.req.param('id')!)
  if (result.changes === 0) return c.json({ ok: false, error: 'Prompt not found' }, 404) as Response
  return c.json({ ok: true })
}

export async function handlePromptsUse(c: Context): Promise<Response> {
  const result = recordUsage(c.req.param('id')!)
  if (result.changes === 0) return c.json({ ok: false, error: 'Prompt not found' }, 404) as Response
  return c.json({ ok: true })
}

export async function handlePromptsReorder(c: Context): Promise<Response> {
  const body = await c.req.json<{ ids?: string[] }>()
  if (!Array.isArray(body.ids)) return c.json({ ok: false, error: 'ids array required' }, 400) as Response
  reorderPrompts(body.ids)
  return c.json({ ok: true })
}

export function handleCategoriesGet(c: Context): Response {
  return c.json({ categories: listCategories() })
}

export async function handleCategoriesCreate(c: Context): Promise<Response> {
  const body = await c.req.json<{ name?: string }>()
  if (!body.name?.trim()) return c.json({ ok: false, error: 'name required' }, 400) as Response
  const category = createCategory(body.name)
  return c.json({ ok: true, category })
}

export async function handleCategoriesUpdate(c: Context): Promise<Response> {
  const id = c.req.param('id')!
  const body = await c.req.json<{ name?: string }>()
  if (!body.name?.trim()) return c.json({ ok: false, error: 'name required' }, 400) as Response
  updateCategory(id, body.name)
  return c.json({ ok: true })
}

export async function handleCategoriesDelete(c: Context): Promise<Response> {
  const result = deleteCategory(c.req.param('id')!)
  return c.json({ ok: true, ...result })
}

export async function handleCategoriesReorder(c: Context): Promise<Response> {
  const body = await c.req.json<{ ids?: string[] }>()
  if (!Array.isArray(body.ids)) return c.json({ ok: false, error: 'ids array required' }, 400) as Response
  reorderCategories(body.ids)
  return c.json({ ok: true })
}

export function handlePromptsExport(c: Context): Response {
  return c.json(exportAll())
}

export async function handlePromptsImport(c: Context): Promise<Response> {
  const body = await c.req.json<ExportData>()
  if (body.version !== 1 || !Array.isArray(body.categories) || !Array.isArray(body.prompts)) {
    return c.json({ ok: false, error: 'Invalid import format' }, 400) as Response
  }
  const result = importAll(body)
  return c.json({ ok: true, ...result })
}
