// ---------------------------------------------------------------------------
//  agents/cron-utils — Form state conversion, schedule/payload building
// ---------------------------------------------------------------------------

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CronJob, CronPayload, CronSchedule } from '@/lib/gateway/types'

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

vi.mock('@/stores/gateway-store', () => ({
  useGatewayStore: { getState: () => ({ setCronData: vi.fn() }) },
}))

const { defaultFormState, formStateToPayload, formStateToSchedule, jobToFormState, refreshCron } = await import(
  '@/app/agents/cron-utils'
)
import type { JobFormState } from '@/app/agents/cron-utils'

afterEach(() => vi.restoreAllMocks())

// ===========================================================================
//  jobToFormState
// ===========================================================================

describe('jobToFormState', () => {
  it('converts cron schedule', () => {
    const job = {
      name: 'test',
      schedule: { kind: 'cron', expr: '*/5 * * * *', tz: 'UTC' },
      payload: { kind: 'systemEvent', text: 'ping' },
      sessionTarget: 'main',
      wakeMode: 'now',
      enabled: true,
    } as CronJob

    const form = jobToFormState(job)
    expect(form.scheduleKind).toBe('cron')
    expect(form.cronExpr).toBe('*/5 * * * *')
    expect(form.cronTz).toBe('UTC')
    expect(form.payloadKind).toBe('systemEvent')
    expect(form.systemEventText).toBe('ping')
  })

  it('converts every-ms schedule to appropriate units', () => {
    const cases = [
      { everyMs: 30_000, value: '30', unit: 'seconds' },
      { everyMs: 300_000, value: '5', unit: 'minutes' },
      { everyMs: 7_200_000, value: '2', unit: 'hours' },
    ] as const

    for (const { everyMs, value, unit } of cases) {
      const form = jobToFormState({
        name: 't',
        schedule: { kind: 'every', everyMs },
        payload: { kind: 'systemEvent', text: '' },
        sessionTarget: 'isolated',
        wakeMode: 'now',
        enabled: true,
      } as CronJob)

      expect(form.intervalValue).toBe(value)
      expect(form.intervalUnit).toBe(unit)
    }
  })

  it('converts at schedule', () => {
    const form = jobToFormState({
      name: 'once',
      schedule: { kind: 'at', at: '2026-03-05T10:30:00.000Z' },
      payload: { kind: 'systemEvent', text: '' },
      sessionTarget: 'isolated',
      wakeMode: 'now',
      enabled: true,
    } as CronJob)

    expect(form.scheduleKind).toBe('at')
    expect(form.atDatetime).toBe('2026-03-05T10:30')
  })

  it('converts agentTurn payload', () => {
    const form = jobToFormState({
      name: 'agent-job',
      schedule: { kind: 'cron', expr: '0 * * * *' },
      payload: { kind: 'agentTurn', message: 'do task', thinking: 'high', timeoutSeconds: 120 },
      sessionTarget: 'main',
      wakeMode: 'next-heartbeat',
      enabled: false,
      deleteAfterRun: true,
    } as CronJob)

    expect(form.payloadKind).toBe('agentTurn')
    expect(form.agentTurnMessage).toBe('do task')
    expect(form.agentTurnThinking).toBe('high')
    expect(form.agentTurnTimeout).toBe('120')
    expect(form.enabled).toBe(false)
    expect(form.deleteAfterRun).toBe(true)
  })
})

// ===========================================================================
//  formStateToSchedule
// ===========================================================================

describe('formStateToSchedule', () => {
  it('builds cron schedule', () => {
    const s = formStateToSchedule({ ...defaultFormState, scheduleKind: 'cron', cronExpr: '0 9 * * *', cronTz: 'Asia/Riyadh' })
    expect(s).toEqual({ kind: 'cron', expr: '0 9 * * *', tz: 'Asia/Riyadh' })
  })

  it('omits tz when empty', () => {
    const s = formStateToSchedule({ ...defaultFormState, scheduleKind: 'cron', cronExpr: '0 * * * *', cronTz: '' })
    expect(s).toEqual({ kind: 'cron', expr: '0 * * * *' })
  })

  it('builds every schedule with correct ms', () => {
    const cases = [
      { value: '30', unit: 'seconds' as const, expected: 30_000 },
      { value: '5', unit: 'minutes' as const, expected: 300_000 },
      { value: '2', unit: 'hours' as const, expected: 7_200_000 },
    ]

    for (const { value, unit, expected } of cases) {
      const s = formStateToSchedule({ ...defaultFormState, scheduleKind: 'every', intervalValue: value, intervalUnit: unit })
      expect((s as CronSchedule & { everyMs: number }).everyMs).toBe(expected)
    }
  })

  it('throws on invalid interval', () => {
    expect(() =>
      formStateToSchedule({ ...defaultFormState, scheduleKind: 'every', intervalValue: 'abc' }),
    ).toThrow('Interval must be a positive number')
  })

  it('throws on zero interval', () => {
    expect(() =>
      formStateToSchedule({ ...defaultFormState, scheduleKind: 'every', intervalValue: '0' }),
    ).toThrow('Interval must be a positive number')
  })

  it('builds at schedule', () => {
    const s = formStateToSchedule({ ...defaultFormState, scheduleKind: 'at', atDatetime: '2026-03-05T10:30' })
    expect(s.kind).toBe('at')
    expect((s as CronSchedule & { at: string }).at).toMatch(/^2026-03-05/)
  })

  it('throws on missing datetime for at schedule', () => {
    expect(() =>
      formStateToSchedule({ ...defaultFormState, scheduleKind: 'at', atDatetime: '' }),
    ).toThrow('Date and time are required')
  })

  it('throws on invalid datetime', () => {
    expect(() =>
      formStateToSchedule({ ...defaultFormState, scheduleKind: 'at', atDatetime: 'not-a-date' }),
    ).toThrow('Invalid date or time value')
  })
})

// ===========================================================================
//  formStateToPayload
// ===========================================================================

describe('formStateToPayload', () => {
  it('builds systemEvent payload', () => {
    const p = formStateToPayload({ ...defaultFormState, payloadKind: 'systemEvent', systemEventText: 'ping' })
    expect(p).toEqual({ kind: 'systemEvent', text: 'ping' })
  })

  it('builds agentTurn payload', () => {
    const p = formStateToPayload({
      ...defaultFormState,
      payloadKind: 'agentTurn',
      agentTurnMessage: 'do it',
      agentTurnThinking: 'low',
      agentTurnTimeout: '60',
    })
    expect(p).toEqual({ kind: 'agentTurn', message: 'do it', thinking: 'low', timeoutSeconds: 60 })
  })

  it('omits thinking and timeout when empty', () => {
    const p = formStateToPayload({
      ...defaultFormState,
      payloadKind: 'agentTurn',
      agentTurnMessage: 'msg',
      agentTurnThinking: '',
      agentTurnTimeout: '',
    })
    expect(p).toEqual({ kind: 'agentTurn', message: 'msg' })
  })
})

// ===========================================================================
//  refreshCron
// ===========================================================================

describe('refreshCron', () => {
  it('calls cron.list and updates store', async () => {
    const jobs = [{ id: 'j1' }]
    const status = { enabled: true }
    const client = { request: vi.fn().mockResolvedValue({ jobs, status }) }

    await refreshCron(client as never)
    expect(client.request).toHaveBeenCalledWith('cron.list', { includeDisabled: true })
  })

  it('does not throw on request failure', async () => {
    const client = { request: vi.fn().mockRejectedValue(new Error('fail')) }
    await expect(refreshCron(client as never)).resolves.not.toThrow()
  })
})
