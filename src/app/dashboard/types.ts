/** Mirrors CostUsageTotals from OpenClaw Gateway (session-cost-usage.types.ts) */
export type CostUsageTotals = {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  totalTokens: number
  totalCost: number
  inputCost: number
  outputCost: number
  cacheReadCost: number
  cacheWriteCost: number
  missingCostEntries: number
}
