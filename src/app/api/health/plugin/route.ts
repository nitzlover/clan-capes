/**
 * Plugin liveness for the dashboard's Online/Offline pill.
 *
 * The plugin is a *consumer* of this API now (it polls + heartbeats),
 * so "online" means we've heard from it recently — not that we can
 * reach a plugin-hosted REST port. `requirePluginAuth` bumps
 * `servers.last_seen_at` on every authed plugin call (heartbeat every
 * 30 s, repo polls on their own cadence), so a last-seen within the
 * staleness window means the plugin is live.
 */

import { NextResponse } from 'next/server';
import { desc } from 'drizzle-orm';
import { dbEnabled, getDb, schema } from '@/lib/server/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 3× the 30 s heartbeat — one missed beat is noise, three is a
// genuinely absent plugin.
const STALE_MS = 90_000;

export async function GET() {
  if (!dbEnabled()) {
    return NextResponse.json({ ok: false, reason: 'db disabled' });
  }
  const db = getDb();
  const [server] = await db
    .select({ lastSeenAt: schema.servers.lastSeenAt })
    .from(schema.servers)
    .orderBy(desc(schema.servers.createdAt))
    .limit(1);

  if (!server?.lastSeenAt) {
    return NextResponse.json({ ok: false, lastSeenAt: null });
  }
  const ageMs = Date.now() - server.lastSeenAt.getTime();
  return NextResponse.json({
    ok: ageMs <= STALE_MS,
    lastSeenAt: server.lastSeenAt.toISOString(),
    ageMs,
  });
}
