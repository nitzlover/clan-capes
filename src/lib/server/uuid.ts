/**
 * UUID canonicalisation.
 *
 * Postgres' `uuid` type stores values case-insensitively but the JS
 * representation we shuttle through DTOs is a plain string. If the
 * plugin sends `D9516D0B-…` and the DB row was stored as the lowercase
 * variant, a naive `String#equals` between the JWT payload and the
 * member row mis-matches and we silently bounce the player out of
 * scope guards / kill ingest / transfer.
 *
 * One canonical form: lowercase, with hyphens, 36 chars total. Apply
 * at insert + lookup + JWT payload to remove the surface entirely.
 */

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const UUID_RAW_RE = /^[0-9a-fA-F]{32}$/;

/**
 * Lowercase a hyphenated UUID. Throws on a malformed value so callers
 * can't accidentally trust a typo'd input through to a DB write.
 */
export function normaliseUuid(raw: string): string {
  if (UUID_RE.test(raw)) return raw.toLowerCase();
  // Accept un-hyphenated 32-char form too (Mojang API returns these).
  if (UUID_RAW_RE.test(raw)) {
    const s = raw.toLowerCase();
    return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
  }
  throw new Error(`invalid UUID: ${raw}`);
}

/**
 * Same as {@link normaliseUuid} but returns null on malformed input
 * instead of throwing — useful in places where we want to reject with
 * a 400 rather than a 500.
 */
export function tryNormaliseUuid(raw: string): string | null {
  try {
    return normaliseUuid(raw);
  } catch {
    return null;
  }
}

/** Shape check without throwing — same regex as {@link normaliseUuid}. */
export function isUuid(raw: string): boolean {
  return UUID_RE.test(raw) || UUID_RAW_RE.test(raw);
}
