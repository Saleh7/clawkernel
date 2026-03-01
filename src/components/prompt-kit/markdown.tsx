import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { memo, useCallback, useEffect, useMemo, useRef } from 'react'
import { detectTextDirection } from '@/lib/text-direction'
import { cn } from '@/lib/utils'

/* ── marked config ─────────────────────────────── */

const markedOptions = { gfm: true, breaks: true }

/* ── Truncation limits (matches OpenClaw UI) ───── */

/** Maximum chars before truncation. Prevents browser freezing on huge messages. */
const CHAR_LIMIT = 140_000
/** Beyond this, skip markdown parsing entirely and render as plain <pre>. */
const PARSE_LIMIT = 40_000

/* ── Sanitization config ───────────────────────── */

const allowedTags = [
  'a',
  'b',
  'blockquote',
  'br',
  'code',
  'del',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'hr',
  'i',
  'img',
  'li',
  'ol',
  'p',
  'pre',
  'strong',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'ul',
  'div',
  'span',
  'button',
  'svg',
  'path',
  'rect',
]
const allowedAttrs = [
  'class',
  'href',
  'rel',
  'target',
  'title',
  'start',
  'data-code',
  'data-lang',
  'data-highlighted',
  'aria-label',
  'src',
  'alt',
  'viewBox',
  'fill',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'd',
  'width',
  'height',
  'x',
  'y',
  'rx',
]
const sanitizeOptions = {
  ALLOWED_TAGS: allowedTags,
  ALLOWED_ATTR: allowedAttrs,
  ADD_DATA_URI_TAGS: ['img'],
}

/* ── LRU Cache ─────────────────────────────────── */

const CACHE_LIMIT = 200
const CACHE_MAX_CHARS = 50_000
const cache = new Map<string, string>()

/* ── Custom renderer ──────────────────────────── */

const renderer = new marked.Renderer()

// Prevent raw HTML from being rendered — display as escaped text (security + UX)
renderer.html = ({ text }: { text: string }) => escapeHtml(text)

// Copy button SVG icons
const COPY_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`
const CHECK_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>`

renderer.code = ({ text, lang }: { text: string; lang?: string }) => {
  const language = lang || ''
  const escaped = escapeHtml(text)
  const dataCode = escapeAttr(text)
  const dataLang = escapeAttr(language)

  const copyBtn = `<button class="cb-copy" data-code="${dataCode}" aria-label="Copy code"><span class="cb-copy-icon">${COPY_ICON}</span><span class="cb-check-icon">${CHECK_ICON}</span></button>`

  const header = language
    ? `<div class="cb-header"><span class="cb-lang">${escapeHtml(language)}</span>${copyBtn}</div>`
    : `<div class="cb-header cb-header-right">${copyBtn}</div>`

  return `<div class="cb-wrap" data-lang="${dataLang}">${header}<div class="cb-code-area"><pre class="cb-pre"><code>${escaped}</code></pre></div></div>`
}

/* ── Helpers ───────────────────────────────────── */

function escapeHtml(v: string) {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeAttr(v: string) {
  return v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Truncate text to a character limit, returning metadata about truncation. */
function truncateText(text: string, limit: number): { text: string; truncated: boolean; total: number } {
  if (text.length <= limit) return { text, truncated: false, total: text.length }
  return { text: text.slice(0, limit), truncated: true, total: text.length }
}

let hooksInstalled = false
function installHooks() {
  if (hooksInstalled) return
  hooksInstalled = true
  // Remove any stale hooks from HMR re-evaluation before re-adding
  DOMPurify.removeHook('afterSanitizeAttributes')
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    // Force safe link attributes on anchors
    if (node instanceof HTMLAnchorElement) {
      const href = node.getAttribute('href')
      if (!href) return
      node.setAttribute('rel', 'noreferrer noopener')
      node.setAttribute('target', '_blank')
    }
    // Block external img src — only allow data: URIs (prevents tracking pixels)
    if (node instanceof HTMLImageElement) {
      const src = node.getAttribute('src') ?? ''
      if (src && !src.startsWith('data:image/')) {
        node.removeAttribute('src')
      }
    }
  })
}

function toSanitizedHtml(markdown: string): string {
  const input = markdown.trim()
  if (!input) return ''
  installHooks()

  if (input.length <= CACHE_MAX_CHARS) {
    const cached = cache.get(input)
    if (cached !== undefined) {
      cache.delete(input)
      cache.set(input, cached)
      return cached
    }
  }

  // Truncate to prevent browser freezing (matches OpenClaw UI's 140K limit)
  const truncated = truncateText(input, CHAR_LIMIT)
  const suffix = truncated.truncated
    ? `\n\n… truncated (${truncated.total.toLocaleString()} chars, showing first ${truncated.text.length.toLocaleString()}).`
    : ''
  const textToRender = `${truncated.text}${suffix}`

  let sanitized: string
  if (textToRender.length > PARSE_LIMIT) {
    // Too large for markdown parsing — render as plain escaped text
    const escaped = escapeHtml(textToRender)
    sanitized = DOMPurify.sanitize(`<pre class="cb-pre">${escaped}</pre>`, sanitizeOptions)
  } else {
    const rendered = marked.parse(textToRender, { ...markedOptions, renderer }) as string
    sanitized = DOMPurify.sanitize(rendered, sanitizeOptions)
  }

  if (input.length <= CACHE_MAX_CHARS) {
    cache.set(input, sanitized)
    if (cache.size > CACHE_LIMIT) {
      const oldest = cache.keys().next().value
      if (oldest) cache.delete(oldest)
    }
  }
  return sanitized
}

/* ── Shiki highlighting (post-render) ──────────── */

async function applyShikiHighlighting(container: HTMLElement, isDark: boolean) {
  const blocks = container.querySelectorAll<HTMLDivElement>('.cb-wrap[data-lang]')
  if (blocks.length === 0) return

  const { highlightCode } = await import('@/lib/shiki')

  for (const block of blocks) {
    const lang = block.dataset.lang
    if (!lang || block.dataset.highlighted === '1') continue

    const codeEl = block.querySelector<HTMLElement>('.cb-pre code')
    if (!codeEl) continue

    const code = codeEl.textContent || ''
    const html = await highlightCode(code, lang, isDark)
    if (!html) continue

    const codeArea = block.querySelector<HTMLElement>('.cb-code-area')
    if (codeArea) {
      codeArea.innerHTML = DOMPurify.sanitize(html, {
        ALLOWED_TAGS: ['pre', 'code', 'span', 'div'],
        ALLOWED_ATTR: ['class', 'style'],
      })
      const pre = codeArea.querySelector('pre')
      if (pre) {
        pre.className = 'cb-pre'
        pre.style.background = 'transparent'
        pre.style.margin = '0'
      }
    }
    block.dataset.highlighted = '1'
  }
}

/* ── Component ─────────────────────────────────── */

type MarkdownProps = {
  children: string
  className?: string
}

function MarkdownComponent({ children, className }: MarkdownProps) {
  const html = useMemo(() => toSanitizedHtml(children), [children])
  const dir = useMemo(() => detectTextDirection(children), [children])
  const ref = useRef<HTMLDivElement>(null)

  const handleCopy = useCallback((e: MouseEvent) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.cb-copy')
    if (!btn) return
    const code = btn.dataset.code
    if (!code) return
    navigator.clipboard.writeText(code)
    btn.classList.add('copied')
    setTimeout(() => btn.classList.remove('copied'), 2000)
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.addEventListener('click', handleCopy)
    return () => el.removeEventListener('click', handleCopy)
  }, [handleCopy])

  // Set innerHTML via ref — avoids dangerouslySetInnerHTML while keeping DOMPurify sanitization.
  // Must run before the Shiki effect so code blocks exist when highlighting starts.
  useEffect(() => {
    if (ref.current) ref.current.innerHTML = html
  }, [html])

  // Apply Shiki highlighting after render; re-highlight all blocks on theme toggle.
  useEffect(() => {
    const el = ref.current
    if (!el || !html) return

    const highlight = (resetHighlighted = false) => {
      if (resetHighlighted) {
        for (const block of el.querySelectorAll<HTMLElement>('[data-highlighted="1"]')) {
          block.removeAttribute('data-highlighted')
        }
      }
      applyShikiHighlighting(el, document.documentElement.classList.contains('dark'))
    }

    highlight()

    const observer = new MutationObserver(() => highlight(true))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [html])

  return <div ref={ref} className={cn('chat-text', className)} dir={dir} />
}

const Markdown = memo(MarkdownComponent)
Markdown.displayName = 'Markdown'

export { Markdown }
