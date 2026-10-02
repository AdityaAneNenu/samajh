/**
 * A tiny fixed-window rate limiter.
 *
 * Honest scope: this is per-process and in-memory. It is not a security
 * boundary and it resets on redeploy. It exists because the endpoint spends
 * real money on inference behind no login, and a public demo link should not
 * be able to drain the API key in an afternoon. A real deployment would move
 * this to a shared store.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitOptions {
  limit?: number;
  windowMs?: number;
  /** Injectable clock, so the tests are deterministic. */
  now?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export const DEFAULT_LIMIT = 8;
export const DEFAULT_WINDOW_MS = 5 * 60 * 1000;

export function checkRateLimit(
  key: string,
  options: RateLimitOptions = {},
): RateLimitResult {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const now = options.now ?? Date.now();

  // Opportunistic cleanup: without it the map grows for the life of the process.
  if (buckets.size > 500) {
    for (const [bucketKey, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(bucketKey);
    }
  }

  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return {
    allowed: true,
    remaining: limit - existing.count,
    retryAfterSeconds: 0,
  };
}

/** Test seam: clears all buckets. */
export function resetRateLimits(): void {
  buckets.clear();
}