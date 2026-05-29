/**
 * Resolve the operative server id for an admin request: explicit
 * `?serverId=N` when valid, else the most-recently-registered
 * server. Returns null only when no server has ever been registered.
 *
 * Extracted from the /api/panel/* handlers that each carried an
 * identical copy — single definition keeps the "default to newest
 * server" behaviour consistent and lets a future change (e.g. an
 * operator's pinned default server) land in one place.
 *
 * Caller must have already confirmed `dbEnabled()` — this issues a
 * query unconditionally.
 */

import { desc } from 'drizzle-orm';
import { getDb, schema } from '@/lib/server/db';

export async function resolveServerId(req: Request): Promise<number | null> {
  const url = new URL(req.url);
  const raw = url.searchParams.get('serverId');
  if (raw) {
    const n = Number(raw);
    if (Number.isInteger(n) && n > 0) return n;
  }
  const db = getDb();
  const [first] = await db
    .select({ id: schema.servers.id })
    .from(schema.servers)
    .orderBy(desc(schema.servers.createdAt))
    .limit(1);
  return first?.id ?? null;
}
