// ---------------------------------------------------------------------------
//  Shared test mocks
// ---------------------------------------------------------------------------

import { vi } from 'vitest'

/** Standard logger mock — silences all output */
export const mockLogger = () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
})
