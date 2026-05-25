/**
 * Leader-panel authentication.
 *
 * Distinct from the admin JWT — leaders authenticate via in-game
 * token exchange (see /api/leader/issue-token + /api/leader/exchange-token)
 * and carry a narrower payload: just their player UUID + the clan
 * they're claiming + their role in that clan + the server id. The
 * cookie name is intentionally different from the admin session so
 * a leader can never accidentally promote themselves to admin by
 * crafting the wrong header.
 *
 * Token lifecycle:
 *   - Plugin POSTs /api/leader/issue-token → fresh random token,
 *     hashed and stored in `leader_tokens` with a 10-min expiry.
 *   - Player visits /clan-panel?t=<token>, the page POSTs to
 *     /api/leader/exchange-token, which marks the row consumed and
 *     mints a signed JWT placed in an HttpOnly cookie.
 *   - Subsequent leader-scoped routes pull the cookie via
 *     {@link requireLeaderAuth} and check the claimed tag matches
 *     the route param + the player is still leader/deputy in the
 *     current clan-repo snapshot (defence-in-depth — a kick should
 *     boot them out of the panel even if the JWT hasn't expired).
 */

import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from './env';

export type LeaderJwtPayload = {
  sub: string; // player UUID (lowercased)
  serverId: number;
  clan: string; // upper-case tag at the time of mint
  role: 'leader' | 'deputy'; // role at the time of mint (re-checked per request)
};

/** Cookie name shipped on the panel's HTTPS origin. */
export const LEADER_COOKIE = 'clp_session';

/**
 * Deterministic SHA-256 hash of the token plaintext so we only ever
 * store the digest in `leader_tokens.token_hash`. Plain hex; the
 * input space is already cryptographic-random (32 bytes), so a
 * single SHA-256 is fine — no salt + bcrypt round trip needed.
 */
export function hashLeaderToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Cryptographically random `lpt_…` token plaintext (43 url-safe chars). */
export function generateLeaderToken(): string {
  const bytes = crypto.randomBytes(32);
  return 'lpt_' + bytes.toString('base64url');
}

export function signLeader(payload: LeaderJwtPayload, ttlSeconds = 60 * 60 * 12): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ttlSeconds });
}

export function verifyLeader(token: string): LeaderJwtPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as LeaderJwtPayload;
    if (!decoded || typeof decoded !== 'object') return null;
    if (typeof decoded.sub !== 'string') return null;
    if (typeof decoded.clan !== 'string') return null;
    if (decoded.role !== 'leader' && decoded.role !== 'deputy') return null;
    if (!Number.isInteger(decoded.serverId)) return null;
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Pull `clp_session` cookie from the incoming Request and return the
 * verified payload, or null on miss / expired / forged. Route handlers
 * also need to re-check the live membership against ClanRepository
 * data (defence-in-depth) — this helper only proves the JWT itself
 * is intact.
 */
export function requireLeaderAuth(req: Request): LeaderJwtPayload | null {
  const header = req.headers.get('cookie');
  if (!header) return null;
  // Parse cookies cheaply — only one cookie we care about, no need
  // for a parser dep. RFC 6265 separators: '; ' between pairs.
  for (const pair of header.split(';')) {
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    const name = pair.slice(0, eq).trim();
    if (name !== LEADER_COOKIE) continue;
    const value = decodeURIComponent(pair.slice(eq + 1).trim());
    return verifyLeader(value);
  }
  return null;
}

/**
 * Set-Cookie header value for the leader session cookie. HttpOnly +
 * SameSite=Lax (we never POST cross-origin for leader ops). Secure
 * flag is enabled in production so the cookie can't leak over plain
 * HTTP. Max-Age matches the JWT TTL so the browser garbage-collects
 * stale entries automatically.
 */
export function leaderCookieHeader(token: string, ttlSeconds: number): string {
  const parts = [
    `${LEADER_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${ttlSeconds}`,
  ];
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  return parts.join('; ');
}

/** Header that clears the cookie (used by /api/leader/logout). */
export function clearLeaderCookieHeader(): string {
  const parts = [
    `${LEADER_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  return parts.join('; ');
}
