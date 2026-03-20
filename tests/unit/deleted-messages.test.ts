import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DeletedMessages } from '@/app/chat/lib/deleted-messages'

const STORAGE_KEY = 'clawkernel:deleted:test-session'

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

describe('DeletedMessages', () => {
  it('starts empty', () => {
    const d = new DeletedMessages('test-session')
    expect(d.has('msg:user:1000:0')).toBe(false)
  })

  it('marks messages as deleted', () => {
    const d = new DeletedMessages('test-session')
    d.delete('msg:user:1000:0')
    expect(d.has('msg:user:1000:0')).toBe(true)
  })

  it('restores deleted messages', () => {
    const d = new DeletedMessages('test-session')
    d.delete('msg:assistant:2000:1')
    d.restore('msg:assistant:2000:1')
    expect(d.has('msg:assistant:2000:1')).toBe(false)
  })

  it('persists to localStorage', () => {
    const d1 = new DeletedMessages('test-session')
    d1.delete('key-a')
    d1.delete('key-b')

    const d2 = new DeletedMessages('test-session')
    expect(d2.has('key-a')).toBe(true)
    expect(d2.has('key-b')).toBe(true)
  })

  it('handles corrupt localStorage gracefully', () => {
    store.set(STORAGE_KEY, '!!!invalid')
    const d = new DeletedMessages('test-session')
    expect(d.has('anything')).toBe(false)
  })

  it('filters non-string values from storage', () => {
    store.set(STORAGE_KEY, JSON.stringify([123, 'valid', null]))
    const d = new DeletedMessages('test-session')
    expect(d.has('valid')).toBe(true)
    expect(d.has('123')).toBe(false)
  })
})
