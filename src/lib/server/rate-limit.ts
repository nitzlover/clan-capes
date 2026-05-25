/**
 * Tiny in-memory IP-keyed sliding-window rate limiter.
 *
 * Single-process panel only — Railway runs one Node instance, so an
 * in-memory map is sufficient and saves us a Redis round-trip. If
 * the panel ever scales out the limiter needs to move to a shared
 * store. Until then this stops credential-stuffing + token-flood
 * attacks cheaply.
 */

type Bucket = { hits: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/**
 * @returns `true` if the request is within budget, `false` if it
 *   should be rejected with a 429.
 */
export function rateLimit(key: string, maxHits: number, windowMs: number): boolean {
  const now = Date.now();
  const cur = buckets.get(key);
  if (!cur || cur.resetAt <= now) {
    buckets.set(key, { hits: 1, resetAt: now + windowMs });
    return true;
  }
  if (cur.hits >= maxHits) return false;
  cur.hits += 1;
  return true;
}

/**
 * Extract the caller's IP from common proxy headers (Railway sets
 * `x-forwarded-for`). Falls back to a synthetic key so the limiter
 * never blanks out — worst case all anonymous requests share one
 * bucket, which is the conservative behaviour.
 */
export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get('x-real-ip');
  if (real) return real;
  return 'unknown';
}

/**
 * Convenience helper: rate-limit a request keyed by route name + IP.
 */
export function limit(
  req: Request,
  scope: string,
  maxHits: number,
  windowMs: number,
): boolean {
  return rateLimit(`${scope}:${clientIp(req)}`, maxHits, windowMs);
}
