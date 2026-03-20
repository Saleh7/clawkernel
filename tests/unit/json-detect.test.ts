import { describe, expect, it } from 'vitest'
import { detectJson } from '@/app/chat/lib/json-detect'

describe('detectJson', () => {
  it('detects a valid JSON object', () => {
    const result = detectJson('{"name":"test","value":42}')
    expect(result).not.toBeNull()
    expect(result!.label).toContain('name')
    expect(result!.pretty).toContain('"name": "test"')
  })

  it('detects a valid JSON array', () => {
    const result = detectJson('[1, 2, 3]')
    expect(result).not.toBeNull()
    expect(result!.label).toBe('Array (3 items)')
  })

  it('returns null for plain text', () => {
    expect(detectJson('hello world')).toBeNull()
  })

  it('returns null for invalid JSON that looks like JSON', () => {
    expect(detectJson('{not: valid json}')).toBeNull()
  })

  it('returns null for text exceeding size limit', () => {
    const huge = `{"key":"${'x'.repeat(25_000)}"}` // >20k chars
    expect(detectJson(huge)).toBeNull()
  })

  it('trims whitespace before detection', () => {
    const result = detectJson('  {"a": 1}  ')
    expect(result).not.toBeNull()
    expect(result!.label).toContain('a')
  })

  it('labels objects with many keys', () => {
    const obj: Record<string, number> = {}
    for (let i = 0; i < 10; i++) obj[`key${i}`] = i
    const result = detectJson(JSON.stringify(obj))
    expect(result).not.toBeNull()
    expect(result!.label).toBe('Object (10 keys)')
  })

  it('labels objects with few keys inline', () => {
    const result = detectJson('{"a":1,"b":2}')
    expect(result!.label).toBe('{ a, b }')
  })

  it('labels single-item array', () => {
    const result = detectJson('[42]')
    expect(result!.label).toBe('Array (1 item)')
  })
})
