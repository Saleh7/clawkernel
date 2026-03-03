export function normalizeVersion(v: string): string {
  return String(v ?? '')
    .replace(/^v/i, '')
    .trim()
}

/**
 * Compare two calendar-style versions.
 * Handles pre-release suffixes (e.g. 2026.3.1-1 > 2026.3.1).
 *
 * Returns: 1 if a > b · -1 if a < b · 0 if equal
 */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string): number[] =>
    normalizeVersion(v)
      .split(/[.-]/)
      .map(Number)
      .filter((n) => !Number.isNaN(n))

  const pa = parse(a)
  const pb = parse(b)

  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0
    const nb = pb[i] ?? 0
    if (na > nb) return 1
    if (na < nb) return -1
  }
  return 0
}
