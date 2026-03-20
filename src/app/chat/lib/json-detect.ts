// Auto-detect JSON in message text and provide formatted output

const MAX_JSON_CHARS = 20_000

export type JsonDetected = { parsed: unknown; pretty: string; label: string }

export function detectJson(text: string): JsonDetected | null {
  const t = text.trim()
  if (t.length > MAX_JSON_CHARS) return null
  if (!(t.startsWith('{') && t.endsWith('}')) && !(t.startsWith('[') && t.endsWith(']'))) return null
  try {
    const parsed = JSON.parse(t)
    return { parsed, pretty: JSON.stringify(parsed, null, 2), label: jsonLabel(parsed) }
  } catch {
    /* expected: text looks like JSON but isn't valid */
    return null
  }
}

function jsonLabel(parsed: unknown): string {
  if (Array.isArray(parsed)) return `Array (${parsed.length} item${parsed.length === 1 ? '' : 's'})`
  if (parsed && typeof parsed === 'object') {
    const keys = Object.keys(parsed)
    return keys.length <= 4 ? `{ ${keys.join(', ')} }` : `Object (${keys.length} keys)`
  }
  return 'JSON'
}
