/** Estatística descritiva simples. Valores nulos são ignorados e contados à parte — nunca imputados. */
export interface Stats {
  n: number
  missing: number
  mean: number | null
  median: number | null
  min: number | null
  max: number | null
}

export const round = (v: number, digits = 1) => {
  const f = 10 ** digits
  return Math.round(v * f) / f
}

export function mean(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
}

export function median(values: number[]): number | null {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

export function describe(raw: (number | null | undefined)[]): Stats {
  const values = raw.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  const m = mean(values)
  const md = median(values)
  return {
    n: values.length,
    missing: raw.length - values.length,
    mean: m === null ? null : round(m),
    median: md === null ? null : round(md),
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
  }
}

export const pct = (part: number, total: number): number | null => (total > 0 ? round((part / total) * 100) : null)

export function countBy<T>(items: T[], key: (item: T) => string | null | undefined): Map<string, number> {
  const map = new Map<string, number>()
  for (const item of items) {
    const k = key(item)
    if (k) map.set(k, (map.get(k) ?? 0) + 1)
  }
  return map
}
