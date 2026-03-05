// ---------------------------------------------------------------------------
//  chat/utils — DOM-dependent function tests (Phase 2, happy-dom)
// ---------------------------------------------------------------------------
// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { compressImage, compressImageBitmap, fileToBase64, readFileAsText } from '@/app/chat/utils'
import { MAX_TEXT_CHARS } from '@/app/chat/types'

// ===========================================================================
//  readFileAsText
// ===========================================================================

describe('readFileAsText', () => {
  it('reads full file content', async () => {
    const file = new File(['hello world'], 'test.txt', { type: 'text/plain' })
    const result = await readFileAsText(file)
    expect(result).toEqual({ text: 'hello world', truncated: false })
  })

  it('truncates content exceeding MAX_TEXT_CHARS', async () => {
    const long = 'x'.repeat(MAX_TEXT_CHARS + 100)
    const file = new File([long], 'big.txt', { type: 'text/plain' })
    const result = await readFileAsText(file)
    expect(result.truncated).toBe(true)
    expect(result.text.length).toBe(MAX_TEXT_CHARS)
  })

  it('returns truncated=false for exactly MAX_TEXT_CHARS', async () => {
    const exact = 'a'.repeat(MAX_TEXT_CHARS)
    const file = new File([exact], 'exact.txt', { type: 'text/plain' })
    const result = await readFileAsText(file)
    expect(result.truncated).toBe(false)
    expect(result.text.length).toBe(MAX_TEXT_CHARS)
  })

  it('handles empty file', async () => {
    const file = new File([''], 'empty.txt', { type: 'text/plain' })
    const result = await readFileAsText(file)
    expect(result).toEqual({ text: '', truncated: false })
  })
})

// ===========================================================================
//  fileToBase64
// ===========================================================================

describe('fileToBase64', () => {
  it('converts a file to base64 string', async () => {
    const file = new File(['hello'], 'test.txt', { type: 'text/plain' })
    const b64 = await fileToBase64(file)
    const decoded = atob(b64)
    expect(decoded).toBe('hello')
  })

  it('handles binary-like content', async () => {
    const bytes = new Uint8Array([0, 1, 2, 255])
    const file = new File([bytes], 'bin.dat', { type: 'application/octet-stream' })
    const b64 = await fileToBase64(file)
    expect(typeof b64).toBe('string')
    expect(b64.length).toBeGreaterThan(0)
  })
})

// ===========================================================================
//  compressImage — mocked Canvas/Image
// ===========================================================================

describe('compressImage', () => {
  const FAKE_BLOB_URL = 'blob:fake-url'
  let revokedUrls: string[]

  beforeEach(() => {
    revokedUrls = []
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => FAKE_BLOB_URL),
      revokeObjectURL: vi.fn((url: string) => revokedUrls.push(url)),
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  function mockImageLoad(width: number, height: number) {
    // Must use function (not arrow) to be callable with `new`
    vi.stubGlobal('Image', function MockImage(this: Record<string, unknown>) {
      this.width = width
      this.height = height
      this.onload = null
      this.onerror = null
      Object.defineProperty(this, 'src', {
        set(_val: string) {
          queueMicrotask(() => (this.onload as (() => void) | null)?.())
        },
      })
    })
  }

  function mockImageError() {
    vi.stubGlobal('Image', function MockImage(this: Record<string, unknown>) {
      this.onload = null
      this.onerror = null
      Object.defineProperty(this, 'src', {
        set(_val: string) {
          queueMicrotask(() => (this.onerror as (() => void) | null)?.())
        },
      })
    })
  }

  function mockCanvas(dataUrl: string) {
    const fakeCtx = { drawImage: vi.fn() }
    const canvasMock = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => fakeCtx),
      toDataURL: vi.fn(() => dataUrl),
    }
    vi.spyOn(document, 'createElement').mockImplementation(
      (tag: string) =>
        (tag === 'canvas' ? canvasMock : document.createElement(tag)) as HTMLElement,
    )
    return canvasMock
  }

  function mockCanvasNoCtx() {
    const canvasMock = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => null),
    }
    vi.spyOn(document, 'createElement').mockImplementation(
      (tag: string) =>
        (tag === 'canvas' ? canvasMock : document.createElement(tag)) as HTMLElement,
    )
  }

  it('resolves with base64 data for JPEG', async () => {
    mockImageLoad(800, 600)
    mockCanvas('data:image/jpeg;base64,AQID')

    const file = new File(['pixels'], 'photo.jpg', { type: 'image/jpeg' })
    const result = await compressImage(file)
    expect(result).toBe('AQID')
    expect(revokedUrls).toContain(FAKE_BLOB_URL)
  })

  it('uses image/png for PNG files', async () => {
    mockImageLoad(100, 100)
    const canvasMock = mockCanvas('data:image/png;base64,PNGDATA')

    const file = new File(['pixels'], 'image.png', { type: 'image/png' })
    const result = await compressImage(file)
    expect(result).toBe('PNGDATA')
    expect(canvasMock.toDataURL).toHaveBeenCalledWith('image/png', expect.any(Number))
  })

  it('rejects when canvas context is null', async () => {
    mockImageLoad(100, 100)
    mockCanvasNoCtx()

    const file = new File(['pixels'], 'bad.jpg', { type: 'image/jpeg' })
    await expect(compressImage(file)).rejects.toThrow('No canvas context')
    expect(revokedUrls).toContain(FAKE_BLOB_URL)
  })

  it('rejects when image fails to load', async () => {
    mockImageError()

    const file = new File(['bad'], 'corrupt.jpg', { type: 'image/jpeg' })
    await expect(compressImage(file)).rejects.toThrow('Failed to load image')
    expect(revokedUrls).toContain(FAKE_BLOB_URL)
  })

  it('scales down oversized images preserving aspect ratio', async () => {
    mockImageLoad(2560, 1440)
    const canvasMock = mockCanvas('data:image/jpeg;base64,SCALED')

    const file = new File(['pixels'], 'big.jpg', { type: 'image/jpeg' })
    await compressImage(file)

    // MAX_IMAGE_DIM = 1280; width > height → w=1280, h=round(1440*1280/2560)=720
    expect(canvasMock.width).toBe(1280)
    expect(canvasMock.height).toBe(720)
  })

  it('scales tall images correctly', async () => {
    mockImageLoad(600, 2000)
    const canvasMock = mockCanvas('data:image/jpeg;base64,TALL')

    const file = new File(['pixels'], 'tall.jpg', { type: 'image/jpeg' })
    await compressImage(file)

    // height > width > MAX_IMAGE_DIM → h=1280, w=round(600*1280/2000)=384
    expect(canvasMock.height).toBe(1280)
    expect(canvasMock.width).toBe(384)
  })

  it('runs quality reduction loop for oversized JPEG', async () => {
    mockImageLoad(800, 600)
    let callCount = 0
    const canvasMock = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage: vi.fn() })),
      toDataURL: vi.fn(() => {
        callCount++
        // TARGET_SIZE=300KB, overhead ratio 1.37 → threshold ~411K chars
        if (callCount <= 2) return `data:image/jpeg;base64,${'A'.repeat(500_000)}`
        return 'data:image/jpeg;base64,SMALL'
      }),
    }
    vi.spyOn(document, 'createElement').mockImplementation(
      (tag: string) =>
        (tag === 'canvas' ? canvasMock : document.createElement(tag)) as HTMLElement,
    )

    const file = new File(['pixels'], 'heavy.jpg', { type: 'image/jpeg' })
    const result = await compressImage(file)
    expect(result).toBe('SMALL')
    expect(callCount).toBeGreaterThan(1)
  })

  it('does not run quality loop for PNG', async () => {
    mockImageLoad(800, 600)
    const canvasMock = mockCanvas(`data:image/png;base64,${'A'.repeat(500_000)}`)

    const file = new File(['pixels'], 'big.png', { type: 'image/png' })
    await compressImage(file)

    // PNG should call toDataURL only once — no quality loop
    expect(canvasMock.toDataURL).toHaveBeenCalledTimes(1)
  })
})

// ===========================================================================
//  compressImageBitmap — mocked OffscreenCanvas/createImageBitmap
// ===========================================================================

describe('compressImageBitmap', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  function setupBitmapMocks(opts: { width?: number; height?: number; blobSize?: number } = {}) {
    const { width = 200, height = 150, blobSize = 1024 } = opts

    const closeFn = vi.fn()
    const fakeCtx = { drawImage: vi.fn() }

    const smallBuf = new ArrayBuffer(4)
    new Uint8Array(smallBuf).set([65, 66, 67, 68])

    const fakeBlob = {
      size: blobSize,
      arrayBuffer: vi.fn(async () => smallBuf),
    }

    const fakeCanvas = {
      getContext: vi.fn(() => fakeCtx),
      convertToBlob: vi.fn(async () => fakeBlob),
    }

    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({
      width,
      height,
      close: closeFn,
    })))

    // Must use function syntax for `new OffscreenCanvas(w, h)`
    vi.stubGlobal('OffscreenCanvas', function MockOffscreenCanvas(this: Record<string, unknown>) {
      Object.assign(this, fakeCanvas)
    })

    return { closeFn, fakeCanvas, fakeCtx, fakeBlob }
  }

  it('resolves with base64 data', async () => {
    const { closeFn } = setupBitmapMocks()

    const file = new File(['pixels'], 'test.jpg', { type: 'image/jpeg' })
    const result = await compressImageBitmap(file)
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
    expect(closeFn).toHaveBeenCalled()
  })

  it('uses image/png for PNG files', async () => {
    const { fakeCanvas } = setupBitmapMocks()

    const file = new File(['pixels'], 'test.png', { type: 'image/png' })
    await compressImageBitmap(file)
    expect(fakeCanvas.convertToBlob).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'image/png' }),
    )
  })

  it('scales down oversized bitmaps', async () => {
    const { fakeCanvas } = setupBitmapMocks({ width: 2560, height: 1440 })

    const file = new File(['pixels'], 'big.jpg', { type: 'image/jpeg' })
    await compressImageBitmap(file)

    // Verify drawImage was called (canvas was created and used with scaled bitmap)
    expect(fakeCanvas.getContext).toHaveBeenCalledWith('2d')
  })

  it('closes bitmap even on error', async () => {
    const closeFn = vi.fn()

    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({
      width: 100,
      height: 100,
      close: closeFn,
    })))

    vi.stubGlobal('OffscreenCanvas', function MockOffscreenCanvas(this: Record<string, unknown>) {
      this.getContext = () => null
    })

    const file = new File(['pixels'], 'err.jpg', { type: 'image/jpeg' })
    await expect(compressImageBitmap(file)).rejects.toThrow('No OffscreenCanvas context')
    expect(closeFn).toHaveBeenCalled()
  })

  it('runs quality loop for oversized JPEG blobs', async () => {
    const closeFn = vi.fn()
    let callCount = 0

    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({
      width: 200,
      height: 150,
      close: closeFn,
    })))

    const smallBuf = new ArrayBuffer(4)
    new Uint8Array(smallBuf).set([65, 66, 67, 68])

    vi.stubGlobal('OffscreenCanvas', function MockOffscreenCanvas(this: Record<string, unknown>) {
      this.getContext = vi.fn(() => ({ drawImage: vi.fn() }))
      this.convertToBlob = vi.fn(async () => {
        callCount++
        if (callCount === 1) return { size: 400_000, arrayBuffer: async () => smallBuf }
        return { size: 1024, arrayBuffer: async () => smallBuf }
      })
    })

    const file = new File(['pixels'], 'heavy.jpg', { type: 'image/jpeg' })
    await compressImageBitmap(file)
    expect(callCount).toBeGreaterThan(1)
  })
})
