// ---------------------------------------------------------------------------
//  chat/utils — Pure function tests (Phase 1)
// ---------------------------------------------------------------------------

import { afterEach, describe, expect, it } from 'vitest'
import {
  extractFileAttachments,
  extractImages,
  extractSourcesFromMessages,
  extractText,
  extractThinking,
  extractToolCalls,
  fmtTimeFull,
  fmtTimeShort,
  generateId,
  getRawText,
  groupMessages,
  stripThinkingTags,
} from '@/app/chat/utils'
import type { ChatMessage } from '@/lib/gateway/types'
import {
  imageBlock,
  imageUrlBlock,
  makeMsg,
  omittedImageBlock,
  textBlock,
  thinkingBlock,
  toolCallBlock,
  resetFixtureSeq,
} from '../helpers/fixtures'

afterEach(() => resetFixtureSeq())

// ===========================================================================
//  stripThinkingTags
// ===========================================================================

describe('stripThinkingTags', () => {
  describe('basic functionality', () => {
    it('returns text unchanged when no thinking tags present', () => {
      const input = 'Hello, this is a normal message.'
      expect(stripThinkingTags(input)).toBe(input)
    })

    it('strips thinking-tag variants', () => {
      const cases = [
        { name: '<think>', input: 'Hello <think>internal</think> world!', expected: 'Hello  world!' },
        { name: '<thinking>', input: 'Before <thinking>some thought</thinking> after', expected: 'Before  after' },
        { name: '<thought>', input: 'A <thought>hmm</thought> B', expected: 'A  B' },
        { name: '<antthinking>', input: 'X <antthinking>internal</antthinking> Y', expected: 'X  Y' },
      ] as const
      for (const { name, input, expected } of cases) {
        expect(stripThinkingTags(input), name).toBe(expected)
      }
    })

    it('strips multiple thinking blocks', () => {
      expect(stripThinkingTags('<think>first</think>A<think>second</think>B')).toBe('AB')
    })

    it('is case-insensitive', () => {
      expect(stripThinkingTags('A <THINK>hidden</THINK> B')).toBe('A  B')
      expect(stripThinkingTags('A <Thinking>hidden</Thinking> B')).toBe('A  B')
    })

    it('handles attributes in tags', () => {
      expect(stripThinkingTags('A <think id="test" class="foo">hidden</think> B')).toBe('A  B')
    })
  })

  describe('code block preservation', () => {
    it('preserves tags inside fenced code blocks', () => {
      const cases = [
        'Use the tag:\n```\n<think>reasoning</think>\n```\nDone!',
        'Example:\n```xml\n<think>\n  <thought>nested</thought>\n</think>\n```\nDone!',
        'Example:\n~~~\n<think>reasoning</think>\n~~~\nDone!',
        'Example:\n~~~js\n<think>code</think>\n~~~',
      ] as const
      for (const input of cases) {
        expect(stripThinkingTags(input)).toBe(input)
      }
    })

    it('preserves tags inside inline code', () => {
      const cases = [
        'The `<think>` tag is used for reasoning.',
        'Use `<think>` to open and `</think>` to close.',
      ] as const
      for (const input of cases) {
        expect(stripThinkingTags(input)).toBe(input)
      }
    })

    it('handles mixed code and real tags', () => {
      const cases = [
        {
          input: '<think>hidden</think>Visible text with `<think>` example.',
          expected: 'Visible text with `<think>` example.',
        },
        {
          input: '```\n<think>code</think>\n```\n<think>real hidden</think>visible',
          expected: '```\n<think>code</think>\n```\nvisible',
        },
        {
          input: 'Before\n```\ncode\n```\nAfter with <think>hidden</think>',
          expected: 'Before\n```\ncode\n```\nAfter with',
        },
      ] as const
      for (const { input, expected } of cases) {
        expect(stripThinkingTags(input)).toBe(expected)
      }
    })

    it('handles double-backtick inline code', () => {
      expect(stripThinkingTags('Use ``code`` with <think>hidden</think> text')).toBe('Use ``code`` with  text')
    })
  })

  describe('edge cases', () => {
    it('returns empty/null-ish inputs unchanged', () => {
      expect(stripThinkingTags('')).toBe('')
      expect(stripThinkingTags('no tags at all')).toBe('no tags at all')
    })

    it('handles unclosed opening tag (strips rest of text)', () => {
      expect(stripThinkingTags('Before <think>unclosed content after')).toBe('Before')
    })

    it('handles orphaned closing tag — strips from closing tag onward', () => {
      // ClawKernel parser: </think> is a valid closing tag even without a matching open.
      // The parser sees no open tag, so </think> acts as a standalone close — removes it.
      expect(stripThinkingTags('You can start with <think and then close with </think>')).toBe(
        'You can start with',
      )
    })

    it('does not parse tags with space after <', () => {
      // ClawKernel parser: `< think>` is not a valid tag — space between < and name
      const input = 'A < think >content< /think > B'
      expect(stripThinkingTags(input)).toBe(input)
    })

    it('handles unicode content', () => {
      expect(stripThinkingTags('你好 <think>思考 🤔</think> 世界')).toBe('你好  世界')
    })

    it('handles nested thinking tags', () => {
      expect(stripThinkingTags('<think>outer <think>inner</think> still outer</think>visible')).toBe(
        'still outervisible',
      )
    })

    it('handles long content efficiently', () => {
      const longContent = 'x'.repeat(10_000)
      expect(stripThinkingTags(`<think>${longContent}</think>visible`)).toBe('visible')
    })

    it('handles pathological backtick patterns without hanging', () => {
      const pathological = '`'.repeat(100) + '<think>test</think>' + '`'.repeat(100)
      // Thinking tags inside matching inline-code fences should stay untouched.
      expect(stripThinkingTags(pathological)).toBe(pathological)
    })
  })
})

// ===========================================================================
//  extractText
// ===========================================================================

describe('extractText', () => {
  it('returns null for undefined message', () => {
    expect(extractText(undefined)).toBeNull()
  })

  it('returns null for message with no text content', () => {
    expect(extractText(makeMsg('assistant', { content: [] }))).toBeNull()
  })

  it('extracts and strips thinking tags for assistant messages', () => {
    const msg = makeMsg('assistant', { content: [textBlock('Hello <think>hidden</think> world')] })
    expect(extractText(msg)).toBe('Hello  world')
  })

  it('strips user envelope (timestamp prefix)', () => {
    const msg = makeMsg('user', {
      content: [textBlock('[Mon 2026-03-05 02:00 GMT+3] Hello')],
    })
    expect(extractText(msg)).toBe('Hello')
  })

  it('joins multiple text blocks', () => {
    const msg = makeMsg('assistant', {
      content: [textBlock('Part 1'), textBlock('Part 2')],
    })
    expect(extractText(msg)).toBe('Part 1\nPart 2')
  })

  it('uses WeakMap cache on second call', () => {
    const msg = makeMsg('assistant', { content: [textBlock('cached')] })
    const first = extractText(msg)
    const second = extractText(msg)
    expect(first).toBe(second)
    expect(first).toBe('cached')
  })
})

// ===========================================================================
//  extractThinking
// ===========================================================================

describe('extractThinking', () => {
  it('returns null for undefined message', () => {
    expect(extractThinking(undefined)).toBeNull()
  })

  it('returns null when no thinking blocks', () => {
    expect(extractThinking(makeMsg('assistant', { content: [textBlock('hello')] }))).toBeNull()
  })

  it('extracts single thinking block', () => {
    const msg = makeMsg('assistant', { content: [thinkingBlock('I need to think')] })
    expect(extractThinking(msg)).toBe('I need to think')
  })

  it('joins multiple thinking blocks with double newline', () => {
    const msg = makeMsg('assistant', {
      content: [thinkingBlock('First thought'), thinkingBlock('Second thought')],
    })
    expect(extractThinking(msg)).toBe('First thought\n\nSecond thought')
  })
})

// ===========================================================================
//  extractImages
// ===========================================================================

describe('extractImages', () => {
  it('returns empty array for undefined message', () => {
    expect(extractImages(undefined)).toEqual([])
  })

  it('returns empty array for message with no images', () => {
    expect(extractImages(makeMsg('assistant', { content: [textBlock('no images')] }))).toEqual([])
  })

  it('extracts OpenAI image_url format', () => {
    const msg = makeMsg('assistant', { content: [imageUrlBlock('https://example.com/img.png')] })
    expect(extractImages(msg)).toEqual([{ kind: 'url', url: 'https://example.com/img.png' }])
  })

  it('extracts inline base64 with source.data', () => {
    const msg = makeMsg('assistant', {
      content: [imageBlock({ data: 'abc123', media_type: 'image/jpeg' })],
    })
    expect(extractImages(msg)).toEqual([{ kind: 'data', mediaType: 'image/jpeg', data: 'abc123' }])
  })

  it('extracts data URL from source.data', () => {
    const msg = makeMsg('assistant', {
      content: [imageBlock({ data: 'data:image/png;base64,abc' })],
    })
    expect(extractImages(msg)).toEqual([{ kind: 'url', url: 'data:image/png;base64,abc' }])
  })

  it('extracts omitted image', () => {
    const msg = makeMsg('assistant', { content: [omittedImageBlock(1024, 'image/webp')] })
    expect(extractImages(msg)).toEqual([{ kind: 'omitted', mediaType: 'image/webp', bytes: 1024 }])
  })

  it('extracts url field directly on block', () => {
    const block = imageBlock()
    ;(block as Record<string, unknown>).url = 'https://example.com/direct.png'
    const msg = makeMsg('assistant', { content: [block] })
    expect(extractImages(msg)).toEqual([{ kind: 'url', url: 'https://example.com/direct.png' }])
  })

  it('handles mixed image types', () => {
    const msg = makeMsg('assistant', {
      content: [
        imageUrlBlock('https://a.com/1.png'),
        omittedImageBlock(512),
      ],
    })
    expect(extractImages(msg)).toHaveLength(2)
  })
})

// ===========================================================================
//  extractToolCalls
// ===========================================================================

describe('extractToolCalls', () => {
  it('returns empty for undefined message', () => {
    expect(extractToolCalls(undefined)).toEqual([])
  })

  it('extracts tool calls with id, name, arguments', () => {
    const msg = makeMsg('assistant', {
      content: [toolCallBlock('tc-1', 'web_search', { query: 'test' })],
    })
    expect(extractToolCalls(msg)).toEqual([{ id: 'tc-1', name: 'web_search', arguments: { query: 'test' } }])
  })
})

// ===========================================================================
//  groupMessages
// ===========================================================================

describe('groupMessages', () => {
  it('returns empty for empty input', () => {
    expect(groupMessages([])).toEqual([])
  })

  it('wraps plain messages as kind=message', () => {
    const msgs = [makeMsg('user', { content: [textBlock('hi')] })]
    const items = groupMessages(msgs)
    expect(items).toHaveLength(1)
    expect(items[0].kind).toBe('message')
  })

  it('groups tool-only assistant messages into toolGroup', () => {
    const msgs = [
      makeMsg('assistant', { content: [toolCallBlock('t1', 'web_search')] }),
      makeMsg('assistant', { content: [toolCallBlock('t2', 'web_fetch')] }),
    ]
    const items = groupMessages(msgs)
    expect(items).toHaveLength(1)
    expect(items[0].kind).toBe('toolGroup')
    if (items[0].kind === 'toolGroup') {
      expect(items[0].messages).toHaveLength(2)
    }
  })

  it('assistant with text+tools = message then toolGroup entry', () => {
    const msgs = [
      makeMsg('assistant', {
        content: [textBlock('Let me search'), toolCallBlock('t1', 'web_search')],
      }),
    ]
    const items = groupMessages(msgs)
    expect(items).toHaveLength(2)
    expect(items[0].kind).toBe('message')
    expect(items[1].kind).toBe('toolGroup')
  })

  it('handles compaction markers as dividers', () => {
    const compacted = makeMsg('assistant', { content: [] }) as Record<string, unknown>
    compacted.__openclaw = { kind: 'compaction' }
    const items = groupMessages([compacted as ChatMessage])
    expect(items).toHaveLength(1)
    expect(items[0].kind).toBe('divider')
    if (items[0].kind === 'divider') {
      expect(items[0].label).toBe('Context compacted')
    }
  })

  it('flushes tool batch before non-tool message', () => {
    const msgs = [
      makeMsg('assistant', { content: [toolCallBlock('t1', 'exec')] }),
      makeMsg('user', { content: [textBlock('thanks')] }),
    ]
    const items = groupMessages(msgs)
    expect(items[0].kind).toBe('toolGroup')
    expect(items[1].kind).toBe('message')
  })
})

// ===========================================================================
//  generateId
// ===========================================================================

describe('generateId', () => {
  it('returns unique ids across 1000 calls', () => {
    const ids = new Set<string>()
    for (let i = 0; i < 1000; i++) ids.add(generateId())
    expect(ids.size).toBe(1000)
  })

  it('returns a valid UUID format', () => {
    const id = generateId()
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})

// ===========================================================================
//  getRawText
// ===========================================================================

describe('getRawText', () => {
  it('returns null for undefined message', () => {
    expect(getRawText(undefined)).toBeNull()
  })

  it('returns null for empty content', () => {
    expect(getRawText(makeMsg('assistant', { content: [] }))).toBeNull()
  })

  it('returns null for whitespace-only text blocks', () => {
    expect(getRawText(makeMsg('assistant', { content: [textBlock('   ')] }))).toBeNull()
  })

  it('joins multiple text blocks with newline', () => {
    const msg = makeMsg('assistant', { content: [textBlock('A'), textBlock('B')] })
    expect(getRawText(msg)).toBe('A\nB')
  })

  it('skips non-text content blocks', () => {
    const msg = makeMsg('assistant', { content: [textBlock('visible'), thinkingBlock('hidden')] })
    expect(getRawText(msg)).toBe('visible')
  })
})

// ===========================================================================
//  extractFileAttachments
// ===========================================================================

describe('extractFileAttachments', () => {
  it('returns empty for text without file blocks', () => {
    expect(extractFileAttachments('no files here')).toEqual([])
  })

  it('extracts single file block', () => {
    const input = '<file name="test.json" mime="application/json">\n{"key":"value"}\n</file>'
    const files = extractFileAttachments(input)
    expect(files).toHaveLength(1)
    expect(files[0]).toEqual({ name: 'test.json', mime: 'application/json', content: '{"key":"value"}' })
  })

  it('extracts multiple file blocks', () => {
    const input = '<file name="a.txt" mime="text/plain">hello</file> text <file name="b.md" mime="text/markdown">world</file>'
    expect(extractFileAttachments(input)).toHaveLength(2)
  })
})

// ===========================================================================
//  extractSourcesFromMessages
// ===========================================================================

describe('extractSourcesFromMessages', () => {
  it('returns empty map for empty messages', () => {
    expect(extractSourcesFromMessages([], new Map())).toEqual(new Map())
  })

  it('attaches web_fetch sources to next text-bearing assistant message', () => {
    const toolResultsMap = new Map([
      ['tc-1', { content: 'page content', isError: false, details: { title: 'Example Page' } }],
    ])
    const messages: ChatMessage[] = [
      makeMsg('user', { content: [textBlock('search this')] }),
      makeMsg('assistant', { content: [toolCallBlock('tc-1', 'web_fetch', { url: 'https://example.com' })] }),
      makeMsg('assistant', { content: [textBlock('Here is what I found')] }),
    ]
    const result = extractSourcesFromMessages(messages, toolResultsMap)
    // Display messages (excluding toolResult) indices: user=0, assistant(tool)=1, assistant(text)=2
    // Sources attach to display index 1 (the text-bearing assistant at display index 1 after filtering)
    expect(result.size).toBe(1)
    const sources = [...result.values()][0]
    expect(sources[0].url).toBe('https://example.com')
    expect(sources[0].title).toBe('Example Page')
  })

  it('extracts web_search results from JSON tool output', () => {
    const searchContent = JSON.stringify({
      results: [
        { url: 'https://a.com', title: 'Result A', description: 'Desc A' },
        { url: 'https://b.com', title: 'Result B' },
      ],
    })
    const toolResultsMap = new Map([
      ['tc-s', { content: searchContent, isError: false }],
    ])
    const messages: ChatMessage[] = [
      makeMsg('user', { content: [textBlock('find info')] }),
      makeMsg('assistant', { content: [toolCallBlock('tc-s', 'web_search', { query: 'test' })] }),
      makeMsg('assistant', { content: [textBlock('Found results')] }),
    ]
    const result = extractSourcesFromMessages(messages, toolResultsMap)
    expect(result.size).toBe(1)
    const sources = [...result.values()][0]
    expect(sources).toHaveLength(2)
    expect(sources[0].url).toBe('https://a.com')
    expect(sources[0].snippet).toBe('Desc A')
  })

  it('deduplicates URLs within same assistant message tool calls', () => {
    const toolResultsMap = new Map([
      ['tc-1', { content: '', isError: false }],
      ['tc-2', { content: '', isError: false }],
    ])
    const messages: ChatMessage[] = [
      makeMsg('user', { content: [textBlock('go')] }),
      makeMsg('assistant', {
        content: [
          toolCallBlock('tc-1', 'web_fetch', { url: 'https://same.com' }),
          toolCallBlock('tc-2', 'web_fetch', { url: 'https://same.com' }),
        ],
      }),
      makeMsg('assistant', { content: [textBlock('done')] }),
    ]
    const result = extractSourcesFromMessages(messages, toolResultsMap)
    const sources = [...result.values()][0]
    expect(sources).toHaveLength(1)
  })

  it('resets pending sources on new user message', () => {
    const toolResultsMap = new Map([
      ['tc-1', { content: '', isError: false }],
    ])
    const messages: ChatMessage[] = [
      makeMsg('assistant', { content: [toolCallBlock('tc-1', 'web_fetch', { url: 'https://old.com' })] }),
      makeMsg('user', { content: [textBlock('new question')] }),
      makeMsg('assistant', { content: [textBlock('answer without sources')] }),
    ]
    const result = extractSourcesFromMessages(messages, toolResultsMap)
    expect(result.size).toBe(0)
  })
})

// ===========================================================================
//  fmtTimeShort / fmtTimeFull
// ===========================================================================

describe('fmtTimeShort', () => {
  it('returns empty string for falsy timestamp', () => {
    expect(fmtTimeShort(undefined)).toBe('')
    expect(fmtTimeShort(0)).toBe('')
  })

  it('returns time for today', () => {
    const result = fmtTimeShort(Date.now())
    expect(result).toMatch(/^\d{2}:\d{2}$/)
  })

  it('returns date for older timestamps', () => {
    const old = Date.now() - 7 * 86_400_000
    const result = fmtTimeShort(old)
    expect(result).toMatch(/\d{2}\s\w{3}/)
  })
})

describe('fmtTimeFull', () => {
  it('returns empty string for falsy timestamp', () => {
    expect(fmtTimeFull(undefined)).toBe('')
    expect(fmtTimeFull(0)).toBe('')
  })

  it('returns full formatted date', () => {
    const result = fmtTimeFull(Date.now())
    expect(result.length).toBeGreaterThan(10)
  })
})
