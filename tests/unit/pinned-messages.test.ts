import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PinnedMessages } from '@/app/chat/lib/pinned-messages'

const STORAGE_KEY = 'clawkernel:pinned:test-session'

const store = new Map<string, string>()
beforeEach(() => {
  store.clear()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('PinnedMessages', () => {
  it('starts empty', () => {
    const p = new PinnedMessages('test-session')
    expect(p.has('msg:user:1000:0')).toBe(false)
    expect(p.keys.size).toBe(0)
  })

  it('toggles pin on/off', () => {
    const p = new PinnedMessages('test-session')
    p.toggle('msg:user:1000:0')
    expect(p.has('msg:user:1000:0')).toBe(true)
    p.toggle('msg:user:1000:0')
    expect(p.has('msg:user:1000:0')).toBe(false)
  })

  it('persists to localStorage', () => {
    const p1 = new PinnedMessages('test-session')
    p1.toggle('msg:assistant:2000:1')
    p1.toggle('msg:user:3000:2')

    const p2 = new PinnedMessages('test-session')
    expect(p2.has('msg:assistant:2000:1')).toBe(true)
    expect(p2.has('msg:user:3000:2')).toBe(true)
    expect(p2.keys.size).toBe(2)
  })

  it('clear removes all pins', () => {
    const p = new PinnedMessages('test-session')
    p.toggle('a')
    p.toggle('b')
    p.clear()
    expect(p.keys.size).toBe(0)
    expect(p.has('a')).toBe(false)
  })

  it('handles corrupt localStorage gracefully', () => {
    store.set(STORAGE_KEY, 'not-json{{{')
    const p = new PinnedMessages('test-session')
    expect(p.keys.size).toBe(0)
  })

  it('filters non-string values from storage', () => {
    store.set(STORAGE_KEY, JSON.stringify([42, null, 'valid-key', true]))
    const p = new PinnedMessages('test-session')
    expect(p.keys.size).toBe(1)
    expect(p.has('valid-key')).toBe(true)
  })
})
