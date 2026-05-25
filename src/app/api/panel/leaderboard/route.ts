/**
 * Admin leaderboard reader.
 *
 *   ?serverId=N      (optional, defaults to most-recent server)
 *   ?season=KEY      (optional, defaults to the server's active key)
 *   ?limit=N         (default 50, capped at 200)
 *
 * Returns:
 *   { season, source: 'db', clans: [...], players: [...] }
 *
 * `clans` is sorted by K/D desc, ties broken by kills desc; `players`
 * the same. Both lists hard-capped server-side so the panel can't be
 * tricked into an unbounded scan.
 */

import { NextResponse } from 'next/server';
import { desc } from 'drizzle-orm';
import { requireAuth } from '@/lib/server/auth';
import { dbEnabled, getDb, schema } from '@/lib/server/db';
import {
  ensureSeasonKey,
  getClanLeaderboard,
  getPlayerLeaderboard,
} from '@/lib/server/stats-repo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

export async function GET(req: Request) {
  const user = requireAuth(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!dbEnabled()) {
    return NextResponse.json({ error: 'db disabled' }, { status: 503 });
  }

  const url = new URL(req.url);
  const rawServerId = url.searchParams.get('serverId');
  const rawLimit = Number(url.searchParams.get('limit'));
  const limit =
    Number.isInteger(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, MAX_LIMIT)
      : DEFAULT_LIMIT;

  let serverId: number | null = null;
  if (rawServerId) {
    const n = Number(rawServerId);
    if (Number.isInteger(n) && n > 0) serverId = n;
  }
  if (serverId == null) {
    const db = getDb();
    const [first] = await db
      .select({ id: schema.servers.id })
      .from(schema.servers)
      .orderBy(desc(schema.servers.createdAt))
      .limit(1);
    if (!first) {
      return NextResponse.json(
        { error: 'no servers registered' },
        { status: 409 },
      );
    }
    serverId = first.id;
  }

  const seasonKey = url.searchParams.get('season') ?? (await ensureSeasonKey(serverId));

  const [clans, players] = await Promise.all([
    getClanLeaderboard(serverId, seasonKey, limit),
    getPlayerLeaderboard(serverId, seasonKey, limit),
  ]);

  return NextResponse.json({
    source: 'db',
    serverId,
    season: seasonKey,
    clans,
    players,
  });
}
