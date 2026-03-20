import { describe, expect, it } from 'vitest'
import { InputHistory } from '@/app/chat/lib/input-history'

describe('InputHistory', () => {
  it('returns null on empty history', () => {
    const h = new InputHistory()
    expect(h.up()).toBeNull()
    expect(h.down()).toBeNull()
  })

  it('navigates up through pushed items', () => {
    const h = new InputHistory()
    h.push('first')
    h.push('second')
    h.push('third')
    expect(h.up()).toBe('third')
    expect(h.up()).toBe('second')
    expect(h.up()).toBe('first')
    expect(h.up()).toBe('first') // stays at oldest
  })

  it('navigates down after going up', () => {
    const h = new InputHistory()
    h.push('a')
    h.push('b')
    h.up() // b
    h.up() // a
    expect(h.down()).toBe('b')
    expect(h.down()).toBeNull() // past end → null
  })

  it('deduplicates consecutive identical pushes', () => {
    const h = new InputHistory()
    h.push('same')
    h.push('same')
    h.push('same')
    expect(h.up()).toBe('same')
    expect(h.up()).toBe('same') // only one entry
  })

  it('ignores empty/whitespace pushes', () => {
    const h = new InputHistory()
    h.push('')
    h.push('   ')
    h.push('\n')
    expect(h.up()).toBeNull()
  })

  it('trims pushed values', () => {
    const h = new InputHistory()
    h.push('  hello  ')
    expect(h.up()).toBe('hello')
  })

  it('caps at 50 items', () => {
    const h = new InputHistory()
    for (let i = 0; i < 60; i++) h.push(`msg-${i}`)
    // Oldest 10 should be evicted
    const items: string[] = []
    let v = h.up()
    while (v !== null) {
      items.push(v)
      const next = h.up()
      if (next === v) break // at oldest
      v = next
    }
    expect(items[0]).toBe('msg-59') // newest
    expect(items.at(-1)).toBe('msg-10') // oldest surviving
  })

  it('resets cursor on push', () => {
    const h = new InputHistory()
    h.push('a')
    h.push('b')
    h.up() // b
    h.push('c')
    expect(h.up()).toBe('c') // cursor reset, starts from newest
  })

  it('reset() clears cursor without clearing items', () => {
    const h = new InputHistory()
    h.push('a')
    h.up() // a
    h.reset()
    expect(h.down()).toBeNull() // cursor reset
    expect(h.up()).toBe('a') // items still there
  })
})
