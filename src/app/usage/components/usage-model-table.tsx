import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatTokens } from '@/lib/format'
import type { UsageModelRow } from '../types'
import { formatCost } from '../utils'

type UsageModelTableProps = Readonly<{
  rows: UsageModelRow[]
}>

const CELL_CLASS = 'px-4 py-2.5 align-top'

export function UsageModelTable({ rows }: UsageModelTableProps) {
  return (
    <Card className="usage-panel gap-4 border-border/60 py-0 shadow-md">
      <CardHeader className="border-b border-border/50 px-5 py-5">
        <CardTitle className="text-base">By Model</CardTitle>
        <p className="text-sm text-muted-foreground">Model-level distribution for the visible slice.</p>
      </CardHeader>
      <CardContent className="overflow-x-auto px-0 pb-5">
        {rows.length === 0 ? (
          <div className="px-6 py-10 text-sm text-muted-foreground">No model usage in the selected period.</div>
        ) : (
          <table className="min-w-[720px] w-full text-xs">
            <thead>
              <tr className="border-y border-border/50 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className={CELL_CLASS}>Model</th>
                <th className={CELL_CLASS}>Sessions</th>
                <th className={CELL_CLASS}>Input</th>
                <th className={CELL_CLASS}>Output</th>
                <th className={CELL_CLASS}>Cache</th>
                <th className={CELL_CLASS}>Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {rows.map((row) => (
                <tr key={row.key} className="hover:bg-muted/20">
                  <td className={CELL_CLASS}>
                    <div className="font-medium text-foreground">{row.model ?? 'unassigned'}</div>
                    <div className="mt-0.5 text-muted-foreground">{row.provider ?? 'unknown provider'}</div>
                  </td>
                  <td className={CELL_CLASS}>{row.count}</td>
                  <td className={CELL_CLASS}>{formatTokens(row.totals.input)}</td>
                  <td className={CELL_CLASS}>{formatTokens(row.totals.output)}</td>
                  <td className={CELL_CLASS}>{formatTokens(row.totals.cacheRead + row.totals.cacheWrite)}</td>
                  <td className={CELL_CLASS}>{formatCost(row.totals.totalCost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  )
}
