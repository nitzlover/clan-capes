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
  // 'all' is a UI sentinel for the aggregate views; it is not a single
  // server, so it deliberately falls through to the newest-server default.
  if (raw && raw !== 'all') {
    const n = Number(raw);
    if (Number.isInteger(n) && n > 0) {
      if (process.env.DEBUG_SCOPE === '1') {
        console.info(`[scope] ${url.pathname} -> explicit serverId=${n}`);
      }
      return n;
    }
  }
  const db = getDb();
  const [first] = await db
    .select({ id: schema.servers.id })
    .from(schema.servers)
    .orderBy(desc(schema.servers.createdAt))
    .limit(1);
  // Set DEBUG_SCOPE=1 on the panel to surface every newest-server
  // fallback — a fallback firing on a request that SHOULD have carried
  // ?serverId is exactly the class of bug that sent cape uploads to the
  // wrong tenant (dead `?server=` key).
  if (process.env.DEBUG_SCOPE === '1') {
    console.warn(
      `[scope] ${url.pathname} -> NO valid ?serverId (raw=${JSON.stringify(raw)}); fell back to newest server ${first?.id ?? 'none'}`,
    );
  }
  return first?.id ?? null;
}
