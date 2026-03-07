import type {
  CronDelivery,
  CronDeliveryMode,
  CronJob,
  CronJobsEnabledFilter,
  CronJobsSortBy,
  CronPayload,
  CronSchedule,
} from '@/lib/gateway/types'

export const ENABLED_FILTER_OPTIONS: Array<{ value: CronJobsEnabledFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'enabled', label: 'Enabled' },
  { value: 'disabled', label: 'Disabled' },
]

export const SORT_BY_OPTIONS: Array<{ value: CronJobsSortBy; label: string }> = [
  { value: 'nextRunAtMs', label: 'Next Run' },
  { value: 'updatedAtMs', label: 'Last Updated' },
  { value: 'name', label: 'Name' },
]

type SchedulePreset =
  | { id: string; label: string; kind: 'cron'; expr: string }
  | { id: string; label: string; kind: 'every'; everyMs: number }
  | { id: string; label: string; kind: 'at' }
  | { id: string; label: string; kind: 'custom' }

export const SCHEDULE_PRESETS: SchedulePreset[] = [
  { id: 'daily-8am', label: 'Every day at 8:00 AM', kind: 'cron', expr: '0 8 * * *' },
  { id: 'daily-6pm', label: 'Every day at 6:00 PM', kind: 'cron', expr: '0 18 * * *' },
  { id: 'monday-9am', label: 'Every Monday at 9:00 AM', kind: 'cron', expr: '0 9 * * 1' },
  { id: 'weekdays-noon', label: 'Weekdays at noon', kind: 'cron', expr: '0 12 * * 1-5' },
  { id: 'twice-day', label: 'Twice a day (8AM & 8PM)', kind: 'cron', expr: '0 8,20 * * *' },
  { id: 'every-hour', label: 'Every hour', kind: 'every', everyMs: 3_600_000 },
  { id: 'every-6h', label: 'Every 6 hours', kind: 'cron', expr: '0 */6 * * *' },
  { id: 'every-30m', label: 'Every 30 minutes', kind: 'every', everyMs: 1_800_000 },
  { id: 'every-5m', label: 'Every 5 minutes', kind: 'every', everyMs: 300_000 },
  { id: 'at', label: 'Run once at a specific time', kind: 'at' },
  { id: 'custom', label: 'Custom schedule (advanced)', kind: 'custom' },
]

export type CronFormState = {
  name: string
  description: string
  agentId: string
  scheduleKind: 'cron' | 'every' | 'at'
  presetId: string
  cronExpr: string
  cronTz: string
  staggerMs: number
  everyMs: number
  atDatetime: string
  sessionTarget: 'main' | 'isolated'
  wakeMode: 'next-heartbeat' | 'now'
  payloadKind: 'systemEvent' | 'agentTurn'
  payloadText: string
  payloadModel: string
  payloadThinking: string
  timeoutSeconds: string
  deliveryMode: CronDeliveryMode
  deliveryChannel: string
  deliveryTo: string
  deliveryBestEffort: boolean
  enabled: boolean
  deleteAfterRun: boolean
}

export const DEFAULT_FORM: CronFormState = {
  name: '',
  description: '',
  agentId: '',
  scheduleKind: 'cron',
  presetId: 'daily-8am',
  cronExpr: '0 8 * * *',
  cronTz: Intl.DateTimeFormat().resolvedOptions().timeZone,
  staggerMs: 0,
  everyMs: 3_600_000,
  atDatetime: '',
  sessionTarget: 'isolated',
  wakeMode: 'now',
  payloadKind: 'agentTurn',
  payloadText: '',
  payloadModel: '',
  payloadThinking: '',
  timeoutSeconds: '',
  deliveryMode: 'announce',
  deliveryChannel: 'last',
  deliveryTo: '',
  deliveryBestEffort: true,
  enabled: true,
  deleteAfterRun: false,
}

export function formToSchedule(f: CronFormState): CronSchedule {
  if (f.scheduleKind === 'at') return { kind: 'at', at: new Date(f.atDatetime).toISOString() }
  if (f.scheduleKind === 'every') return { kind: 'every', everyMs: f.everyMs }
  return {
    kind: 'cron',
    expr: f.cronExpr.trim(),
    ...(f.cronTz ? { tz: f.cronTz } : {}),
    ...(f.staggerMs ? { staggerMs: f.staggerMs } : {}),
  }
}

export function formToPayload(f: CronFormState): CronPayload {
  if (f.payloadKind === 'systemEvent') return { kind: 'systemEvent', text: f.payloadText.trim() }
  return {
    kind: 'agentTurn',
    message: f.payloadText.trim(),
    ...(f.payloadModel.trim() ? { model: f.payloadModel.trim() } : {}),
    ...(f.payloadThinking ? { thinking: f.payloadThinking } : {}),
    ...(f.timeoutSeconds ? { timeoutSeconds: Number(f.timeoutSeconds) } : {}),
  }
}

export function formToDelivery(f: CronFormState): CronDelivery {
  if (f.deliveryMode === 'none') return { mode: 'none' }
  return {
    mode: f.deliveryMode,
    channel: f.deliveryChannel || undefined,
    to: f.deliveryTo.trim() || undefined,
    bestEffort: f.deliveryBestEffort,
  }
}

export function jobToForm(job: CronJob): CronFormState {
  const s = job.schedule
  let scheduleKind: CronFormState['scheduleKind'] = 'cron'
  let cronExpr = '0 8 * * *'
  let cronTz = ''
  let everyMs = 3_600_000
  let atDatetime = ''
  let presetId = 'custom'

  let staggerMs = 0

  if (s.kind === 'cron') {
    cronExpr = s.expr
    cronTz = s.tz ?? ''
    staggerMs = s.staggerMs ?? 0
    const match = SCHEDULE_PRESETS.find((p) => p.kind === 'cron' && 'expr' in p && p.expr === s.expr)
    if (match) presetId = match.id
  } else if (s.kind === 'every') {
    scheduleKind = 'every'
    everyMs = s.everyMs
    const match = SCHEDULE_PRESETS.find((p) => p.kind === 'every' && 'everyMs' in p && p.everyMs === s.everyMs)
    if (match) presetId = match.id
  } else if (s.kind === 'at') {
    scheduleKind = 'at'
    atDatetime = s.at.slice(0, 16)
    presetId = 'at'
  }

  const p = job.payload
  const d = job.delivery

  return {
    name: job.name,
    description: job.description ?? '',
    agentId: job.agentId ?? '',
    scheduleKind,
    presetId,
    cronExpr,
    cronTz,
    staggerMs,
    everyMs,
    atDatetime,
    sessionTarget: job.sessionTarget,
    wakeMode: job.wakeMode,
    payloadKind: p.kind,
    payloadText: p.kind === 'systemEvent' ? p.text : p.message,
    payloadModel: p.kind === 'agentTurn' ? (p.model ?? '') : '',
    payloadThinking: p.kind === 'agentTurn' ? (p.thinking ?? '') : '',
    timeoutSeconds: p.kind === 'agentTurn' && p.timeoutSeconds ? String(p.timeoutSeconds) : '',
    deliveryMode: d?.mode ?? 'none',
    deliveryChannel: d?.channel ?? 'last',
    deliveryTo: d?.to ?? '',
    deliveryBestEffort: d?.bestEffort ?? true,
    enabled: job.enabled,
    deleteAfterRun: job.deleteAfterRun ?? false,
  }
}

export function validateForm(f: CronFormState): string | null {
  if (!f.name.trim()) return 'Name is required'
  if (f.scheduleKind === 'cron' && !f.cronExpr.trim()) return 'Cron expression is required'
  if (f.scheduleKind === 'every' && f.everyMs <= 0) return 'Interval must be greater than 0'
  if (f.scheduleKind === 'at' && !f.atDatetime) return 'Run time is required'
  if (!f.payloadText.trim())
    return f.payloadKind === 'systemEvent' ? 'Event text is required' : 'Agent message is required'
  return null
}
