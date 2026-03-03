import { AlertCircle } from 'lucide-react'
import { buildFailureGuide } from '@/lib/cron'
import type { CronDelivery } from '@/lib/gateway/types'

type Props = {
  readonly error: string
  readonly delivery?: CronDelivery
  readonly consecutiveErrors?: number
  readonly onFix: () => void
  readonly compact?: boolean
}

export function FailureGuideCard({ error, delivery, consecutiveErrors, onFix, compact = false }: Props) {
  const guide = buildFailureGuide(error, delivery)
  const steps = compact ? guide.steps.slice(0, 2) : guide.steps

  return (
    <div className="rounded-lg border border-red-500/25 bg-red-500/8 px-3 py-2.5">
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-300" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-red-700 dark:text-red-200">
            Last run failed{consecutiveErrors && consecutiveErrors > 1 ? ` (${consecutiveErrors}×)` : ''}
          </p>
          <p className="mt-1 text-xs font-medium text-red-700/90 dark:text-red-200/95">{guide.headline}</p>
          <p className="mt-1 text-xs leading-5 text-red-700/80 dark:text-red-100/90">{guide.explanation}</p>
          <div className="mt-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-red-700/80 dark:text-red-200/90">
              What to do
            </p>
            <ol className="mt-1 space-y-1 text-xs text-red-700/85 dark:text-red-100/90">
              {steps.map((step, i) => (
                <li key={step}>
                  {i + 1}. {step}
                </li>
              ))}
            </ol>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onFix}
              className="rounded bg-red-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-red-500"
            >
              Open job settings
            </button>
            {!compact && (
              <details className="text-xs">
                <summary className="cursor-pointer text-red-700/80 hover:text-red-700 dark:text-red-200/90 dark:hover:text-red-100">
                  Technical details
                </summary>
                <pre className="mt-1 max-h-36 overflow-auto whitespace-pre-wrap rounded-md border border-red-500/20 bg-red-500/5 px-2 py-1.5 font-mono text-[11px] leading-relaxed text-red-700/80 dark:text-red-100/90">
                  {error}
                </pre>
              </details>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
