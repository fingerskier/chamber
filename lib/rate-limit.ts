// Per-instance in-memory limiter — fine for v0 on serverless (each instance
// enforces independently; registration grants nothing until approved anyway).
const hits = new Map<string, number[]>()

export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now()
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs)
  if (recent.length >= max) return false
  recent.push(now)
  hits.set(key, recent)
  return true
}
