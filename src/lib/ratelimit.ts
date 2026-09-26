import { HttpError } from "./http";

const g = globalThis as unknown as { rateBuckets?: Map<string, { count: number; resetAt: number }> };
const buckets = (g.rateBuckets ??= new Map());

/** Fixed-window in-memory limiter. Throws 429 once `limit` hits within `windowMs`. */
export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 10_000) for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    return;
  }
  if (++b.count > limit) throw new HttpError(429, "尝试太频繁，请稍后再试");
}

export function clientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}
