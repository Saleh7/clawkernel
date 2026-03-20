import { describe, expect, it } from 'vitest'
import { isSilentReply } from '@/app/chat/lib/silent-filter'
import { makeMsg, textBlock } from '../helpers/fixtures'

describe('isSilentReply', () => {
  it('detects exact NO_REPLY', () => {
    expect(isSilentReply(makeMsg('assistant', { content: [textBlock('NO_REPLY')] }))).toBe(true)
  })

  it('detects NO_REPLY with surrounding whitespace', () => {
    expect(isSilentReply(makeMsg('assistant', { content: [textBlock('  NO_REPLY  ')] }))).toBe(true)
    expect(isSilentReply(makeMsg('assistant', { content: [textBlock('\nNO_REPLY\n')] }))).toBe(true)
  })

  it('ignores NO_REPLY embedded in real content', () => {
    expect(isSilentReply(makeMsg('assistant', { content: [textBlock('Here is help. NO_REPLY')] }))).toBe(false)
  })

  it('ignores non-assistant roles', () => {
    expect(isSilentReply(makeMsg('user', { content: [textBlock('NO_REPLY')] }))).toBe(false)
    expect(isSilentReply(makeMsg('tool', { content: [textBlock('NO_REPLY')] }))).toBe(false)
  })

  it('passes normal assistant messages', () => {
    expect(isSilentReply(makeMsg('assistant', { content: [textBlock('Hello!')] }))).toBe(false)
  })

  it('passes empty assistant messages', () => {
    expect(isSilentReply(makeMsg('assistant', { content: [] }))).toBe(false)
  })
})
