import type { GatewayClient } from '@/lib/gateway/client'
import type { CronJob, CronPayload, CronSchedule } from '@/lib/gateway/types'
import { createLogger } from '@/lib/logger'
import { useGatewayStore } from '@/stores/gateway-store'

export { formatDuration, formatRelative, formatSchedule } from '@/lib/cron'

const log = createLogger('agents:cron')

export async function refreshCron(client: GatewayClient) {
  try {
    const res = await client.request<{ status: import('@/lib/gateway/types').CronStatus; jobs: CronJob[] }>(
      'cron.list',
      { includeDisabled: true },
    )
    useGatewayStore.getState().setCronData(res.jobs, res.status)
  } catch (err) {
    log.warn('Cron list failed', err)
  }
}

// -- Form state -------------------------------------------------------------

export type JobFormState = {
  name: string
  description: string
  scheduleKind: 'cron' | 'every' | 'at'
  cronExpr: string
  cronTz: string
  intervalValue: string
  intervalUnit: 'seconds' | 'minutes' | 'hours'
  atDatetime: string
  sessionTarget: 'main' | 'isolated'
  wakeMode: 'next-heartbeat' | 'now'
  payloadKind: 'systemEvent' | 'agentTurn'
  systemEventText: string
  agentTurnMessage: string
  agentTurnThinking: string
  agentTurnTimeout: string
  enabled: boolean
  deleteAfterRun: boolean
}

export const defaultFormState: JobFormState = {
  name: '',
  description: '',
  scheduleKind: 'cron',
  cronExpr: '0 * * * *',
  cronTz: '',
  intervalValue: '60',
  intervalUnit: 'minutes',
  atDatetime: '',
  sessionTarget: 'isolated',
  wakeMode: 'now',
  payloadKind: 'systemEvent',
  systemEventText: '',
  agentTurnMessage: '',
  agentTurnThinking: '',
  agentTurnTimeout: '',
  enabled: true,
  deleteAfterRun: false,
}

export function jobToFormState(job: CronJob): JobFormState {
  const s = job.schedule
  let scheduleKind: JobFormState['scheduleKind'] = 'cron'
  let cronExpr = '0 * * * *'
  let cronTz = ''
  let intervalValue = '60'
  let intervalUnit: JobFormState['intervalUnit'] = 'minutes'
  let atDatetime = ''

  if (s.kind === 'cron') {
    cronExpr = s.expr
    cronTz = s.tz ?? ''
  } else if (s.kind === 'every') {
    scheduleKind = 'every'
    const sec = s.everyMs / 1000
    if (sec >= 3600 && sec % 3600 === 0) {
      intervalValue = String(sec / 3600)
      intervalUnit = 'hours'
    } else if (sec >= 60 && sec % 60 === 0) {
      intervalValue = String(sec / 60)
    } else {
      intervalValue = String(sec)
      intervalUnit = 'seconds'
    }
  } else if (s.kind === 'at') {
    scheduleKind = 'at'
    atDatetime = s.at.slice(0, 16)
  }

  const p = job.payload
  return {
    name: job.name,
    description: job.description ?? '',
    scheduleKind,
    cronExpr,
    cronTz,
    intervalValue,
    intervalUnit,
    atDatetime,
    sessionTarget: job.sessionTarget,
    wakeMode: job.wakeMode,
    payloadKind: p.kind,
    systemEventText: p.kind === 'systemEvent' ? p.text : '',
    agentTurnMessage: p.kind === 'agentTurn' ? p.message : '',
    agentTurnThinking: p.kind === 'agentTurn' ? (p.thinking ?? '') : '',
    agentTurnTimeout: p.kind === 'agentTurn' && p.timeoutSeconds ? String(p.timeoutSeconds) : '',
    enabled: job.enabled,
    deleteAfterRun: job.deleteAfterRun ?? false,
  }
}

function intervalUnitMultiplier(unit: JobFormState['intervalUnit']): number {
  if (unit === 'hours') return 3_600_000
  if (unit === 'minutes') return 60_000
  return 1_000
}

export function formStateToSchedule(f: JobFormState): CronSchedule {
  if (f.scheduleKind === 'cron') {
    return { kind: 'cron', expr: f.cronExpr, ...(f.cronTz ? { tz: f.cronTz } : {}) }
  }
  if (f.scheduleKind === 'every') {
    const multiplier = intervalUnitMultiplier(f.intervalUnit)
    const ms = Number(f.intervalValue)
    if (!Number.isFinite(ms) || ms <= 0) throw new Error('Interval must be a positive number')
    return { kind: 'every', everyMs: ms * multiplier }
  }
  if (!f.atDatetime) throw new Error('Date and time are required')
  const at = new Date(f.atDatetime)
  if (!Number.isFinite(at.getTime())) throw new Error('Invalid date or time value')
  return { kind: 'at', at: at.toISOString() }
}

export function formStateToPayload(f: JobFormState): CronPayload {
  if (f.payloadKind === 'agentTurn') {
    return {
      kind: 'agentTurn',
      message: f.agentTurnMessage,
      ...(f.agentTurnThinking ? { thinking: f.agentTurnThinking } : {}),
      ...(f.agentTurnTimeout ? { timeoutSeconds: Number(f.agentTurnTimeout) } : {}),
    }
  }
  return { kind: 'systemEvent', text: f.systemEventText }
}
