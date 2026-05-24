/**
 * Mojang username lookup by UUID.
 *
 * Used by the PowerClans import path so we can paint a real player
 * name on every imported clan_member row instead of the "Leader"
 * placeholder we used at first cut.
 *
 * Mojang's sessionserver caches profiles aggressively (~30 s TTL on
 * misses) and rate-limits per-IP at ~600 calls / 10 min, which is
 * far more than any reasonable clan-import batch.
 *
 * Tolerates failure: returns null on transport error / 4xx / 5xx so
 * callers can fall back to a sane placeholder without aborting the
 * whole import.
 */

const SESSION_BASE = 'https://sessionserver.mojang.com/session/minecraft/profile/';

/**
 * Resolve `uuid` (dashed or undashed) to the current Minecraft
 * username, or null if Mojang doesn't know or the call fails.
 *
 * Times out after 4 s — Mojang's edge is usually <300 ms, so 4 s is
 * generous without making the import button feel hung when their
 * sessionserver has a bad day.
 */
export async function resolveMojangName(uuid: string): Promise<string | null> {
  const stripped = uuid.replace(/-/g, '');
  if (!/^[0-9a-fA-F]{32}$/.test(stripped)) return null;

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 4000);
  try {
    const res = await fetch(SESSION_BASE + stripped, { signal: ctl.signal });
    if (!res.ok) return null;
    const body = (await res.json()) as { name?: string };
    return body.name ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
