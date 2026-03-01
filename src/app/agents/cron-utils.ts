// ---------------------------------------------------------------------------
//  Cron — Pure helpers, form types & converters
// ---------------------------------------------------------------------------

import type { GatewayClient } from '@/lib/gateway/client'
import type { CronJob, CronPayload, CronSchedule } from '@/lib/gateway/types'
import { createLogger } from '@/lib/logger'
import { useGatewayStore } from '@/stores/gateway-store'

export const log = createLogger('agents:cron')

// -- Formatting helpers -----------------------------------------------------

export function formatSchedule(job: CronJob): { label: string; kind: string } {
  const s = job.schedule
  if (s.kind === 'cron') return { label: `${s.expr}${s.tz ? ` (${s.tz})` : ''}`, kind: 'cron' }
  if (s.kind === 'every') {
    const sec = Math.round(s.everyMs / 1000)
    if (sec < 60) return { label: `every ${sec}s`, kind: 'interval' }
    if (sec < 3600) return { label: `every ${Math.round(sec / 60)}m`, kind: 'interval' }
    return { label: `every ${(sec / 3600).toFixed(1)}h`, kind: 'interval' }
  }
  if (s.kind === 'at') return { label: new Date(s.at).toLocaleString(), kind: 'one-shot' }
  return { label: '—', kind: 'unknown' }
}

export function formatRelative(ms?: number | null): string {
  if (!ms) return '—'
  const diff = Date.now() - ms
  if (Math.abs(diff) < 60_000) return 'just now'
  if (diff < 0) return `in ${Math.round(-diff / 60_000)}m`
  if (diff < 3600_000) return `${Math.round(diff / 60_000)}m ago`
  if (diff < 86400_000) return `${Math.round(diff / 3600_000)}h ago`
  return `${Math.round(diff / 86400_000)}d ago`
}

export function formatDuration(ms?: number): string {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

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
    scheduleKind = 'cron'
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
      intervalUnit = 'minutes'
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

export function formStateToSchedule(f: JobFormState): CronSchedule {
  if (f.scheduleKind === 'cron') {
    return { kind: 'cron', expr: f.cronExpr, ...(f.cronTz ? { tz: f.cronTz } : {}) }
  }
  if (f.scheduleKind === 'every') {
    const multiplier = f.intervalUnit === 'hours' ? 3600_000 : f.intervalUnit === 'minutes' ? 60_000 : 1000
    return { kind: 'every', everyMs: Number(f.intervalValue) * multiplier }
  }
  return { kind: 'at', at: new Date(f.atDatetime).toISOString() }
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
