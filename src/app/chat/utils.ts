import type { ChatMessage } from '@/lib/gateway/types'
import type { FileAttachment, RenderItem, Source } from './types'
import { IMAGE_QUALITY, MAX_IMAGE_DIM, MAX_TEXT_CHARS, TARGET_SIZE } from './types'

const INBOUND_CONTEXT_RE = /^Conversation info \(untrusted metadata\):\s*```json?\s*\{[\s\S]*?\}\s*```\s*/
const TIMESTAMP_PREFIX = /^\[(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\s+[A-Z+\d]+\]\s*/
const MEDIA_ATTACHED_RE = /\[media attached:[^\]]*\]\s*/g
const FILE_BLOCK_RE = /<file\s+name="([^"]*?)"\s+mime="([^"]*?)">\n?([\s\S]*?)\n?<\/file>/

export function extractFileAttachments(text: string): FileAttachment[] {
  const files: FileAttachment[] = []
  const re = new RegExp(FILE_BLOCK_RE.source, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    files.push({ name: m[1], mime: m[2], content: m[3] })
  }
  return files
}

function stripDisplayEnvelope(text: string): string {
  let t = text
  t = t.replace(INBOUND_CONTEXT_RE, '')
  t = t.replace(TIMESTAMP_PREFIX, '')
  t = t.replace(MEDIA_ATTACHED_RE, '')
  t = t.replace(new RegExp(FILE_BLOCK_RE.source, 'g'), '')
  return t.trim()
}

export function getRawText(msg: ChatMessage | undefined): string | null {
  if (!msg?.content) return null
  // Join ALL text blocks (some models split response across multiple text blocks)
  const parts: string[] = []
  for (const b of msg.content) {
    if (b.type === 'text' && 'text' in b && typeof b.text === 'string' && b.text.trim()) {
      parts.push(b.text)
    }
  }
  return parts.length > 0 ? parts.join('\n') : null
}

const textCache = new WeakMap<object, string | null>()
const thinkingCache = new WeakMap<object, string | null>()

export function extractText(msg: ChatMessage | undefined): string | null {
  if (!msg) return null
  if (textCache.has(msg)) return textCache.get(msg) ?? null
  const raw = getRawText(msg)
  let result: string | null = null
  if (raw) {
    result = msg.role === 'user' ? stripDisplayEnvelope(raw) : stripThinkingTags(raw)
  }
  textCache.set(msg, result)
  return result
}

// -- Thinking tag stripping (ported from OpenClaw reasoning-tags.ts) --------

const THINKING_TAG_NAMES = new Set(['think', 'thinking', 'thought', 'antthinking'])

interface CodeRegion {
  start: number
  end: number
}

type ThinkingTagMatch = {
  start: number
  end: number
  isClose: boolean
}

function maybeContainsThinkingTag(text: string): boolean {
  const lower = text.toLowerCase()
  return lower.includes('<think') || lower.includes('<thought') || lower.includes('<antthinking')
}

function isAsciiLetter(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122)
}

type RawTagBounds = {
  start: number
  end: number
  rawInside: string
}

type ParsedThinkingTag = {
  isClose: boolean
}

function nextRawTagBounds(text: string, cursor: number): RawTagBounds | null {
  const start = text.indexOf('<', cursor)
  if (start === -1) return null

  const end = text.indexOf('>', start + 1)
  if (end === -1) return null

  return {
    start,
    end,
    rawInside: text.slice(start + 1, end).trim(),
  }
}

function readTagName(candidate: string): string | null {
  let nameEnd = 0
  while (nameEnd < candidate.length && isAsciiLetter(candidate[nameEnd])) {
    nameEnd += 1
  }
  if (nameEnd === 0) return null
  return candidate.slice(0, nameEnd).toLowerCase()
}

function parseThinkingTag(rawInside: string): ParsedThinkingTag | null {
  if (!rawInside) return null

  const isClose = rawInside.startsWith('/')
  const candidate = isClose ? rawInside.slice(1).trimStart() : rawInside
  const tagName = readTagName(candidate)
  if (!tagName || !THINKING_TAG_NAMES.has(tagName)) return null

  return { isClose }
}

function findThinkingTagMatches(text: string): ThinkingTagMatch[] {
  const matches: ThinkingTagMatch[] = []
  let cursor = 0

  while (cursor < text.length) {
    const bounds = nextRawTagBounds(text, cursor)
    if (!bounds) break

    const parsed = parseThinkingTag(bounds.rawInside)
    if (parsed) {
      matches.push({ start: bounds.start, end: bounds.end + 1, isClose: parsed.isClose })
    }

    cursor = bounds.end + 1
  }

  return matches
}

function isRegionInside(container: CodeRegion, targetStart: number, targetEnd: number): boolean {
  return targetStart >= container.start && targetEnd <= container.end
}

function findFencedCodeRegions(text: string): CodeRegion[] {
  const regions: CodeRegion[] = []
  let cursor = 0

  while (cursor < text.length) {
    const lineStart = cursor === 0 || text[cursor - 1] === '\n'
    if (!lineStart) {
      cursor += 1
      continue
    }

    let fence = ''
    if (text.startsWith('```', cursor)) {
      fence = '```'
    } else if (text.startsWith('~~~', cursor)) {
      fence = '~~~'
    }
    if (!fence) {
      cursor += 1
      continue
    }

    const openLineEnd = text.indexOf('\n', cursor)
    const contentStart = openLineEnd === -1 ? text.length : openLineEnd + 1

    let regionEnd = text.length
    const closingFenceStart = text.indexOf(`\n${fence}`, contentStart)
    if (closingFenceStart !== -1) {
      const closingLineStart = closingFenceStart + 1
      const closingLineEnd = text.indexOf('\n', closingLineStart)
      regionEnd = closingLineEnd === -1 ? text.length : closingLineEnd + 1
    }

    regions.push({ start: cursor, end: regionEnd })
    cursor = regionEnd
  }

  return regions
}

function countBackticks(text: string, start: number): number {
  let tickCount = 0
  while (text[start + tickCount] === '`') {
    tickCount += 1
  }
  return tickCount
}

function findInlineCodeEnd(text: string, start: number, tickCount: number): number {
  let searchFrom = start + tickCount

  while (searchFrom < text.length) {
    const nextTick = text.indexOf('`', searchFrom)
    if (nextTick === -1) return -1

    const runCount = countBackticks(text, nextTick)
    if (runCount === tickCount && nextTick > start + tickCount) {
      return nextTick + tickCount
    }

    searchFrom = nextTick + runCount
  }

  return -1
}

function findInlineCodeRegions(text: string, fencedRegions: CodeRegion[]): CodeRegion[] {
  const regions: CodeRegion[] = []
  let cursor = 0

  while (cursor < text.length) {
    if (text[cursor] !== '`') {
      cursor += 1
      continue
    }

    const start = cursor
    const tickCount = countBackticks(text, start)
    const end = findInlineCodeEnd(text, start, tickCount)

    if (end === -1) {
      cursor = start + tickCount
      continue
    }

    const insideFenced = fencedRegions.some((region) => isRegionInside(region, start, end))
    if (!insideFenced) {
      regions.push({ start, end })
    }

    cursor = end
  }

  return regions
}

function findCodeRegions(text: string): CodeRegion[] {
  const fenced = findFencedCodeRegions(text)
  const inline = findInlineCodeRegions(text, fenced)
  return [...fenced, ...inline].sort((a, b) => a.start - b.start)
}

export function stripThinkingTags(text: string): string {
  if (!text || !maybeContainsThinkingTag(text)) return text

  const codeRegions = findCodeRegions(text)
  const isInCode = (pos: number) => codeRegions.some((r) => pos >= r.start && pos < r.end)
  const tagMatches = findThinkingTagMatches(text)
  if (tagMatches.length === 0) return text

  let result = ''
  let lastIndex = 0
  let inThinking = false

  for (const match of tagMatches) {
    if (isInCode(match.start)) continue

    if (!inThinking) {
      result += text.slice(lastIndex, match.start)
      if (!match.isClose) {
        inThinking = true
      }
    } else if (match.isClose) {
      inThinking = false
    }

    lastIndex = match.end
  }

  if (!inThinking) {
    result += text.slice(lastIndex)
  }

  return result.trim()
}

export function extractThinking(msg: ChatMessage | undefined): string | null {
  if (!msg) return null
  if (thinkingCache.has(msg)) return thinkingCache.get(msg) ?? null
  const parts: string[] = []
  if (msg.content) {
    for (const b of msg.content) {
      if (b.type === 'thinking' && 'thinking' in b && b.thinking) {
        parts.push(b.thinking)
      }
    }
  }
  const result = parts.length > 0 ? parts.join('\n\n') : null
  thinkingCache.set(msg, result)
  return result
}

type ToolCall = {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export function extractToolCalls(msg: ChatMessage | undefined): ToolCall[] {
  if (!msg?.content) return []
  return msg.content
    .filter((b): b is Extract<typeof b, { type: 'toolCall' }> => b.type === 'toolCall')
    .map((b) => ({
      id: ('id' in b ? b.id : '') || '',
      name: ('name' in b ? b.name : '') || 'unknown',
      arguments: ('arguments' in b ? b.arguments : {}) || {},
    }))
}

type ExtractedImage =
  | { kind: 'data'; mediaType: string; data: string }
  | { kind: 'url'; url: string }
  | { kind: 'omitted'; mediaType: string; bytes: number }

export function extractImages(msg: ChatMessage | undefined): ExtractedImage[] {
  if (!msg?.content) return []
  return msg.content
    .filter((b) => b.type === 'image' || b.type === 'image_url')
    .map((b): ExtractedImage | null => {
      // The server sends varying shapes for image blocks — use Record for safe access
      const block = b as Record<string, unknown>

      // OpenAI image_url format
      if (block.type === 'image_url') {
        const imageUrl = block.image_url as Record<string, unknown> | undefined
        const url = imageUrl?.url
        if (typeof url === 'string') return { kind: 'url', url }
        return null
      }

      // Inline base64 data (optimistic messages / live stream)
      const source = block.source as Record<string, unknown> | undefined
      if (source?.data) {
        const data = source.data as string
        if (data.startsWith('data:')) return { kind: 'url', url: data }
        return {
          kind: 'data',
          mediaType: (source.media_type as string) || (source.mimeType as string) || 'image/png',
          data,
        }
      }
      if (block.data && typeof block.data === 'string') {
        return {
          kind: 'data',
          mediaType: (block.mimeType as string) || (block.media_type as string) || 'image/png',
          data: block.data,
        }
      }

      if (typeof block.url === 'string') return { kind: 'url', url: block.url }

      // Server-omitted image (chat.history strips image data)
      if (block.omitted) {
        return {
          kind: 'omitted',
          mediaType: (block.mimeType as string) || (block.media_type as string) || 'image/png',
          bytes: (block.bytes as number) ?? 0,
        }
      }

      return null
    })
    .filter(Boolean) as ExtractedImage[]
}

type ToolResultEntry = { content: string; isError: boolean; details?: Record<string, unknown> }
type ToolResultsMap = Map<string, ToolResultEntry>

const SOURCE_SNIPPET_MAX_CHARS = 200

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url // Malformed URL — use raw string as fallback
  }
}

function getFavicon(_domain: string): string {
  // No external favicon service — privacy-safe. Sources panel uses domain initial as fallback.
  return ''
}

function isDisplayMessage(msg: ChatMessage): boolean {
  return msg.role !== 'toolResult' && msg.role !== 'tool'
}

function collectAssistantSources(
  toolCalls: ToolCall[],
  toolResultsMap: ToolResultsMap,
  pendingSources: Source[],
): void {
  if (toolCalls.length === 0) return

  const seenUrls = new Set<string>()
  for (const toolCall of toolCalls) {
    if (toolCall.name === 'web_fetch') {
      appendWebFetchSource(toolCall, toolResultsMap, seenUrls, pendingSources)
      continue
    }
    if (toolCall.name === 'web_search') {
      appendWebSearchSources(toolCall, toolResultsMap, seenUrls, pendingSources)
    }
  }
}

function appendWebFetchSource(
  toolCall: ToolCall,
  toolResultsMap: ToolResultsMap,
  seenUrls: Set<string>,
  pendingSources: Source[],
): void {
  const url = getWebFetchUrl(toolCall.arguments)
  if (!url) return
  if (seenUrls.has(url)) return

  seenUrls.add(url)
  const domain = getDomain(url)
  const toolResult = toolResultsMap.get(toolCall.id)

  pendingSources.push({
    url,
    title: getSourceTitle(domain, toolResult?.details),
    domain,
    favicon: getFavicon(domain),
    snippet: getWebFetchSnippet(toolResult),
  })
}

function getWebFetchUrl(args: Record<string, unknown>): string | null {
  const url = args.url
  return typeof url === 'string' ? url : null
}

function getSourceTitle(domain: string, details?: Record<string, unknown>): string {
  if (typeof details?.title === 'string') return details.title
  return domain
}

function getSnippetFromDetails(details?: Record<string, unknown>): string | undefined {
  if (!details) return undefined

  const snippet = details.snippet
  if (typeof snippet === 'string' && snippet) return snippet

  const description = details.description
  if (typeof description === 'string') return description
  if (typeof snippet === 'string') return snippet

  return undefined
}

function getWebFetchSnippet(toolResult?: ToolResultEntry): string | undefined {
  let snippet = getSnippetFromDetails(toolResult?.details)
  if (!snippet && toolResult?.content) {
    snippet = toolResult.content.slice(0, SOURCE_SNIPPET_MAX_CHARS)
  }
  return snippet
}

function appendWebSearchSources(
  toolCall: ToolCall,
  toolResultsMap: ToolResultsMap,
  seenUrls: Set<string>,
  pendingSources: Source[],
): void {
  const toolResult = toolResultsMap.get(toolCall.id)
  const searchResults = parseWebSearchResults(toolResult?.content)

  for (const searchResult of searchResults) {
    const url = getSearchResultUrl(searchResult)
    if (!url) continue
    if (seenUrls.has(url)) continue

    seenUrls.add(url)
    const domain = getDomain(url)
    pendingSources.push({
      url,
      title: getSearchResultTitle(searchResult, domain),
      domain,
      favicon: getFavicon(domain),
      snippet: getSearchResultSnippet(searchResult),
    })
  }
}

function parseWebSearchResults(content: string | undefined): Array<Record<string, unknown>> {
  if (!content) return []

  try {
    const parsed = JSON.parse(content)
    if (!isRecord(parsed)) return []
    if (!Array.isArray(parsed.results)) return []
    return parsed.results.filter(isRecord)
  } catch {
    return []
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getSearchResultUrl(searchResult: Record<string, unknown>): string | null {
  const url = searchResult.url
  return typeof url === 'string' ? url : null
}

function getSearchResultTitle(searchResult: Record<string, unknown>, domain: string): string {
  const title = searchResult.title
  return typeof title === 'string' && title ? title : domain
}

function getSearchResultSnippet(searchResult: Record<string, unknown>): string | undefined {
  const description = searchResult.description
  if (typeof description === 'string' && description) return description

  const snippet = searchResult.snippet
  if (typeof snippet === 'string') return snippet

  return undefined
}

function shouldAttachPendingSources(msg: ChatMessage, toolCalls: ToolCall[], pendingSources: Source[]): boolean {
  if (toolCalls.length > 0) return false
  if (pendingSources.length === 0) return false
  return Boolean(extractText(msg))
}

export function extractSourcesFromMessages(
  messages: ChatMessage[],
  toolResultsMap: ToolResultsMap,
): Map<number, Source[]> {
  const result = new Map<number, Source[]>()
  let pendingSources: Source[] = []
  const display = messages.filter(isDisplayMessage)

  for (let i = 0; i < display.length; i++) {
    const msg = display[i]

    if (msg.role === 'user') {
      pendingSources = []
      continue
    }
    if (msg.role !== 'assistant') continue

    const toolCalls = extractToolCalls(msg)
    collectAssistantSources(toolCalls, toolResultsMap, pendingSources)

    if (!shouldAttachPendingSources(msg, toolCalls, pendingSources)) continue
    result.set(i, [...pendingSources])
    pendingSources = []
  }

  return result
}

export function groupMessages(messages: ChatMessage[]): RenderItem[] {
  const items: RenderItem[] = []
  let toolBatch: ChatMessage[] = []
  let toolIndices: number[] = []

  const flushTools = () => {
    if (toolBatch.length === 0) return
    items.push({ kind: 'toolGroup', messages: [...toolBatch], indices: [...toolIndices] })
    toolBatch = []
    toolIndices = []
  }

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]

    // Compaction marker from OpenClaw server
    const marker = (msg as Record<string, unknown>).__openclaw as { kind?: string } | undefined
    if (marker?.kind === 'compaction') {
      flushTools()
      items.push({ kind: 'divider', label: 'Context compacted', timestamp: msg.timestamp })
      continue
    }

    const toolCalls = extractToolCalls(msg)
    const text = extractText(msg)
    const thinkingText = extractThinking(msg)
    const hasText = text?.trim() || (!text?.trim() && thinkingText)
    const hasTools = msg.role === 'assistant' && toolCalls.length > 0

    if (hasTools && !hasText) {
      toolBatch.push(msg)
      toolIndices.push(i)
    } else if (hasTools && hasText) {
      flushTools()
      items.push({ kind: 'message', msg, index: i })
      toolBatch.push(msg)
      toolIndices.push(i)
    } else {
      flushTools()
      items.push({ kind: 'message', msg, index: i })
    }
  }
  flushTools()
  return items
}

function fallbackRandomIdPart(): string {
  if (typeof crypto === 'object' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(8)
    crypto.getRandomValues(bytes)
    let token = ''
    for (const byte of bytes) {
      token += byte.toString(16).padStart(2, '0')
    }
    return token
  }
  return `${Date.now().toString(16)}-${Math.random().toString(36).slice(2)}`
}

export function generateId() {
  if (typeof crypto === 'object' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${fallbackRandomIdPart()}`
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function fmtTimeShort(ts?: number) {
  if (!ts) return ''
  const d = new Date(ts),
    now = new Date()
  return isSameDay(d, now)
    ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

export function fmtTimeFull(ts?: number) {
  if (!ts) return ''
  return new Date(ts).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export async function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      try {
        let w = img.width,
          h = img.height
        if (w > MAX_IMAGE_DIM || h > MAX_IMAGE_DIM) {
          if (w > h) {
            h = Math.round((h * MAX_IMAGE_DIM) / w)
            w = MAX_IMAGE_DIM
          } else {
            w = Math.round((w * MAX_IMAGE_DIM) / h)
            h = MAX_IMAGE_DIM
          }
        }
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          URL.revokeObjectURL(url)
          reject(new Error('No canvas context'))
          return
        }
        ctx.drawImage(img, 0, 0, w, h)
        const outType = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
        let quality = IMAGE_QUALITY
        let dataUrl = canvas.toDataURL(outType, quality)
        if (outType === 'image/jpeg') {
          const target = TARGET_SIZE * 1.37 // Base64 overhead ratio (~4/3)
          while (dataUrl.length > target && quality > 0.31) {
            quality -= 0.1
            dataUrl = canvas.toDataURL(outType, quality)
          }
        }
        const b64 = dataUrl.split(',')[1]
        URL.revokeObjectURL(url)
        b64 ? resolve(b64) : reject(new Error('Failed to encode'))
      } catch (e) {
        URL.revokeObjectURL(url)
        reject(e)
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image'))
    }
    img.src = url
  })
}

/**
 * Fallback image compressor using `createImageBitmap` (works with formats
 * that `new Image()` can't decode, e.g. some clipboard screenshots).
 * Applies the same resize + quality logic as `compressImage`.
 */
export async function compressImageBitmap(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  try {
    let w = bitmap.width,
      h = bitmap.height
    if (w > MAX_IMAGE_DIM || h > MAX_IMAGE_DIM) {
      if (w > h) {
        h = Math.round((h * MAX_IMAGE_DIM) / w)
        w = MAX_IMAGE_DIM
      } else {
        w = Math.round((w * MAX_IMAGE_DIM) / h)
        h = MAX_IMAGE_DIM
      }
    }
    const canvas = new OffscreenCanvas(w, h)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('No OffscreenCanvas context')
    ctx.drawImage(bitmap, 0, 0, w, h)

    const outType = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
    let quality = IMAGE_QUALITY
    let blob = await canvas.convertToBlob({ type: outType, quality })

    if (outType === 'image/jpeg') {
      while (blob.size > TARGET_SIZE && quality > 0.31) {
        quality -= 0.1
        blob = await canvas.convertToBlob({ type: outType, quality })
      }
    }

    const buf = await blob.arrayBuffer()
    const bytes = new Uint8Array(buf)
    let binary = ''
    for (const byte of bytes) binary += String.fromCodePoint(byte)
    const b64 = btoa(binary)
    if (!b64) throw new Error('Failed to encode via OffscreenCanvas')
    return b64
  } finally {
    bitmap.close()
  }
}

export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const b64 = result.split(',')[1]
      b64 ? resolve(b64) : reject(new Error('Failed to encode file'))
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

export async function readFileAsText(file: File): Promise<{ text: string; truncated: boolean }> {
  try {
    const full = await file.text()
    if (full.length > MAX_TEXT_CHARS) {
      return { text: full.slice(0, MAX_TEXT_CHARS), truncated: true }
    }
    return { text: full, truncated: false }
  } catch {
    throw new Error('Failed to read file')
  }
}
