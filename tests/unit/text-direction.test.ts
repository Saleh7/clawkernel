// ---------------------------------------------------------------------------
//  lib/text-direction — RTL detection
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest'
import { detectTextDirection } from '@/lib/text-direction'

describe('detectTextDirection', () => {
  it('returns "ltr" for English text', () => {
    expect(detectTextDirection('Hello world')).toBe('ltr')
  })

  it('returns "rtl" for Arabic text', () => {
    expect(detectTextDirection('مرحبا بالعالم')).toBe('rtl')
  })

  it('returns "rtl" for Hebrew text', () => {
    expect(detectTextDirection('שלום עולם')).toBe('rtl')
  })

  it('skips leading punctuation and whitespace', () => {
    expect(detectTextDirection('  - مرحبا')).toBe('rtl')
    expect(detectTextDirection('  "Hello"')).toBe('ltr')
  })

  it('returns "ltr" for null/undefined/empty', () => {
    expect(detectTextDirection(null)).toBe('ltr')
    expect(detectTextDirection(undefined)).toBe('ltr')
    expect(detectTextDirection('')).toBe('ltr')
  })

  it('returns "ltr" for punctuation-only text', () => {
    expect(detectTextDirection('...')).toBe('ltr')
  })

  it('detects direction from first significant character', () => {
    // Arabic after English punctuation
    expect(detectTextDirection('# عنوان')).toBe('rtl')
    // English after symbols
    expect(detectTextDirection('>>> Hello')).toBe('ltr')
  })
})
