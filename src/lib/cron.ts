import type { CronJob, CronSchedule } from '@/lib/gateway/types'

// -- Time formatting --------------------------------------------------------

export function formatRelative(ms?: number | null): string {
  if (!ms) return '—'
  const diff = Date.now() - ms
  if (diff < 0) {
    const abs = Math.abs(diff)
    if (abs < 60_000) return `in ${Math.floor(abs / 1_000)}s`
    if (abs < 3_600_000) return `in ${Math.floor(abs / 60_000)}m`
    if (abs < 86_400_000) return `in ${Math.floor(abs / 3_600_000)}h`
    return `in ${Math.floor(abs / 86_400_000)}d`
  }
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

export function formatDuration(ms?: number | null): string {
  if (ms == null) return '—'
  if (ms < 1_000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1_000).toFixed(1)}s`
  return `${(ms / 60_000).toFixed(1)}m`
}

export function formatDate(ms: number | undefined, is24h: boolean): string {
  if (!ms) return '—'
  return new Date(ms).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: !is24h,
  })
}

export function formatFullDate(ms: number | undefined, is24h: boolean): string {
  if (!ms) return '—'
  return new Date(ms).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: !is24h,
  })
}

// -- Schedule formatting ----------------------------------------------------

function formatClock(hour24: number, minute: number, is24h: boolean): string {
  if (is24h) return `${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  const suffix = hour24 < 12 ? 'AM' : 'PM'
  const hour12 = hour24 % 12 || 12
  return `${hour12}:${String(minute).padStart(2, '0')} ${suffix}`
}

export function cronToHuman(expr: string, is24h: boolean): string {
  const parts = expr.trim().split(/\s+/)
  if (parts.length < 5) return expr
  const [min, hour, day, month, dow] = parts

  if (min.startsWith('*/') && hour === '*' && day === '*' && month === '*' && dow === '*') {
    const n = min.slice(2)
    if (/^\d+$/.test(n)) return n === '1' ? 'Every minute' : `Every ${n} minutes`
  }
  if (min === '0' && hour.startsWith('*/') && day === '*' && month === '*' && dow === '*') {
    const n = hour.slice(2)
    if (/^\d+$/.test(n)) return n === '1' ? 'Every hour' : `Every ${n} hours`
  }
  if (min === '0' && hour === '*' && day === '*' && month === '*' && dow === '*') return 'Every hour'
  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && day === '*' && month === '*' && dow === '*') {
    return `Daily at ${formatClock(Number.parseInt(hour, 10), Number.parseInt(min, 10), is24h)}`
  }
  if (min === '0' && /^\d+,\d+$/.test(hour) && day === '*' && month === '*' && dow === '*') {
    const [h1, h2] = hour.split(',').map((x) => Number.parseInt(x, 10))
    return `Twice a day (${formatClock(h1, 0, is24h)} & ${formatClock(h2, 0, is24h)})`
  }
  if (min === '0' && /^\d+$/.test(hour) && day === '*' && month === '*' && dow === '1-5') {
    return `Weekdays at ${formatClock(Number.parseInt(hour, 10), 0, is24h)}`
  }
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  if (min === '0' && /^\d+$/.test(hour) && day === '*' && month === '*' && /^\d$/.test(dow)) {
    const d = Number.parseInt(dow, 10)
    if (d >= 0 && d <= 6) {
      return `Every ${dayNames[d]} at ${formatClock(Number.parseInt(hour, 10), 0, is24h)}`
    }
  }
  return expr
}

export function formatSchedule(schedule: CronSchedule, is24h: boolean): { label: string; kind: string } {
  if (schedule.kind === 'cron') {
    const human = cronToHuman(schedule.expr, is24h)
    const tz = schedule.tz ? ` (${schedule.tz})` : ''
    return { label: `${human}${tz}`, kind: 'cron' }
  }
  if (schedule.kind === 'every') {
    const sec = Math.round(schedule.everyMs / 1_000)
    if (sec < 60) return { label: `Every ${sec}s`, kind: 'interval' }
    if (sec < 3_600) return { label: `Every ${Math.round(sec / 60)}m`, kind: 'interval' }
    return { label: `Every ${(sec / 3_600).toFixed(1)}h`, kind: 'interval' }
  }
  if (schedule.kind === 'at') return { label: new Date(schedule.at).toLocaleString(), kind: 'one-shot' }
  return { label: '—', kind: 'unknown' }
}

// -- Delivery helpers -------------------------------------------------------

export function describeDelivery(job: CronJob): { label: string; hasIssue: boolean; issue?: string } {
  const d = job.delivery
  if (!d || d.mode === 'none') return { label: 'No delivery', hasIssue: false }
  const parts: string[] = [d.mode]
  if (d.channel) parts.push(`→ ${d.channel}`)
  if (d.to) parts.push(`→ ${d.to}`)
  const hasIssue = d.mode === 'announce' && !d.to
  return {
    label: parts.join(' '),
    hasIssue,
    issue: hasIssue ? 'Missing delivery target. The job will run but delivery will fail.' : undefined,
  }
}

// -- Failure diagnosis ------------------------------------------------------

type FailureGuide = {
  headline: string
  explanation: string
  steps: string[]
}

export function buildFailureGuide(error: string, delivery?: CronJob['delivery']): FailureGuide {
  const lower = error.toLowerCase()
  const channelHint = delivery?.channel
    ? `Set recipient in Delivery for the ${delivery.channel} channel.`
    : 'Set a delivery channel and recipient.'

  if (lower.includes('delivery target is missing') || (lower.includes('delivery') && lower.includes('missing'))) {
    return {
      headline: 'Delivery destination is missing',
      explanation: 'The job ran successfully, but it had nowhere to send the result.',
      steps: ['Open job settings.', channelHint, 'Save and run once to confirm.'],
    }
  }
  if (lower.includes('unauthorized') || lower.includes('invalid api key') || lower.includes('authentication failed')) {
    return {
      headline: 'Provider authentication failed',
      explanation: 'Credentials are missing, expired, or invalid.',
      steps: ['Reconnect the provider in Models or Accounts.', 'Verify the model is available.', 'Run again.'],
    }
  }
  if (lower.includes('model') && (lower.includes('not found') || lower.includes('unavailable'))) {
    return {
      headline: 'Selected model is unavailable',
      explanation: 'The configured model could not be resolved at runtime.',
      steps: ['Edit the job and choose a valid model or clear the override.', 'Run once manually to validate.'],
    }
  }
  if (lower.includes('timed out') || lower.includes('timeout')) {
    return {
      headline: 'The job timed out',
      explanation: 'The run exceeded the allowed execution window.',
      steps: ['Shorten the prompt.', 'Try a faster model.', 'Run once manually and check duration.'],
    }
  }
  if (lower.includes('econnrefused') || lower.includes('network') || lower.includes('dns')) {
    return {
      headline: 'Connection to a required service failed',
      explanation: 'The job could not reach a provider or local service.',
      steps: ['Check network connectivity.', 'Verify local model services are running.', 'Retry.'],
    }
  }
  return {
    headline: 'The run failed',
    explanation: 'An unexpected error occurred while executing this job.',
    steps: ['Confirm schedule, model, and delivery fields.', 'Run once manually to verify.'],
  }
}
