export type PromptCategory = {
  id: string
  name: string
  sortOrder: number
  createdAt: number
}

export type Prompt = {
  id: string
  categoryId: string
  title: string
  content: string
  pinned: boolean
  sortOrder: number
  usageCount: number
  lastUsedAt: number | null
  createdAt: number
  updatedAt: number
}

const BASE = '/api'

async function api<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  })
  return res.json()
}

export async function fetchPrompts(): Promise<{ categories: PromptCategory[]; prompts: Prompt[] }> {
  return api('/prompts')
}

export async function createPrompt(data: {
  categoryId: string
  title: string
  content: string
}): Promise<{ ok: boolean; prompt: Prompt }> {
  return api('/prompts', { method: 'POST', body: JSON.stringify(data) })
}

export async function updatePrompt(
  id: string,
  data: Partial<{ title: string; content: string; categoryId: string; pinned: boolean }>,
): Promise<{ ok: boolean }> {
  return api(`/prompts/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
}

export async function deletePrompt(id: string): Promise<{ ok: boolean }> {
  return api(`/prompts/${id}`, { method: 'DELETE' })
}

export async function recordPromptUsage(id: string): Promise<{ ok: boolean }> {
  return api(`/prompts/${id}/use`, { method: 'POST' })
}

export async function reorderPrompts(ids: string[]): Promise<{ ok: boolean }> {
  return api('/prompts/reorder', { method: 'POST', body: JSON.stringify({ ids }) })
}

export async function createCategory(name: string): Promise<{ ok: boolean; category: PromptCategory }> {
  return api('/prompt-categories', { method: 'POST', body: JSON.stringify({ name }) })
}

export async function updateCategory(id: string, name: string): Promise<{ ok: boolean }> {
  return api(`/prompt-categories/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) })
}

export async function deleteCategory(id: string): Promise<{ ok: boolean }> {
  return api(`/prompt-categories/${id}`, { method: 'DELETE' })
}

export async function exportPrompts(): Promise<{ version: 1; categories: PromptCategory[]; prompts: Prompt[] }> {
  return api('/prompts/export')
}

export async function importPrompts(data: {
  version: 1
  categories: PromptCategory[]
  prompts: Prompt[]
}): Promise<{ ok: boolean; categories: number; prompts: number }> {
  return api('/prompts/import', { method: 'POST', body: JSON.stringify(data) })
}
