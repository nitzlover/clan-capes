/**
 * Online-now snapshot for the dashboard.
 *
 * Reads the in-memory cache last populated by the plugin's heartbeat
 * and returns the UUID list (lowercased, no dashes? dashes — same
 * shape the heartbeat sent). The UI joins this against clan_members
 * to decorate each member with a green/grey dot.
 *
 * Returns `{ source: 'plugin', uuids: [...], updatedAt: ms }` on a
 * fresh snapshot, or `{ source: 'stale', uuids: [], updatedAt: null }`
 * when no heartbeat has landed within the staleness window. The UI
 * treats the stale case as "don't know" rather than "nobody online".
 */

import { NextResponse } from 'next/server';
import { desc } from 'drizzle-orm';
import { requireAuth } from '@/lib/server/auth';
import { dbEnabled, getDb, schema } from '@/lib/server/db';
import { getOnlineUuids } from '@/lib/server/online-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const user = requireAuth(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // Resolve target server. Same fallback the rest of the dashboard
  // uses — explicit ?serverId or "most recently registered".
  const url = new URL(req.url);
  const raw = url.searchParams.get('serverId');
  let serverId: number | null = null;
  if (raw) {
    const n = Number(raw);
    if (Number.isInteger(n) && n > 0) serverId = n;
  }
  if (serverId == null && dbEnabled()) {
    const db = getDb();
    const [first] = await db
      .select({ id: schema.servers.id })
      .from(schema.servers)
      .orderBy(desc(schema.servers.createdAt))
      .limit(1);
    if (first) serverId = first.id;
  }
  if (serverId == null) {
    return NextResponse.json({ source: 'stale', uuids: [], updatedAt: null });
  }

  const snap = getOnlineUuids(serverId);
  if (!snap) {
    return NextResponse.json({
      source: 'stale',
      uuids: [],
      updatedAt: null,
    });
  }
  return NextResponse.json({
    source: 'plugin',
    uuids: snap.uuids,
    updatedAt: snap.updatedAt,
  });
}
