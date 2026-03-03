// openclaw CLI wrapper — expects `openclaw` in PATH (installed globally via npm).

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const OPENCLAW_BIN = 'openclaw'

interface ExecResult {
  stdout: string
  stderr: string
}

export async function execOpenClaw(args: string[], opts: { timeout?: number } = {}): Promise<ExecResult> {
  const { timeout = 30_000 } = opts
  return execFileAsync(OPENCLAW_BIN, args, {
    timeout,
    env: { ...process.env, NO_COLOR: '1' },
  })
}
