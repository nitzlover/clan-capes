/**
 * Admin-facing list of DB-backed clans, scoped by serverId query
 * param.
 *
 * Distinct from `/api/panel/clans` (which still scans the cape upload
 * directory for the legacy roster on the Capes page). This endpoint
 * powers the new Phase 2 `/dashboard/clans` admin surface.
 */

import { NextResponse } from 'next/server';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { requireAuth } from '@/lib/server/auth';
import { listClansForServer } from '@/lib/server/clan-repo';
import { dbEnabled, getDb, schema } from '@/lib/server/db';
import { ensureSeasonKey } from '@/lib/server/stats-repo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const user = requireAuth(req);
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!dbEnabled()) {
    return NextResponse.json({ clans: [], servers: [] });
  }

  const url = new URL(req.url);
  const serverIdRaw = url.searchParams.get('serverId');

  const db = getDb();
  const servers = await db
    .select({ id: schema.servers.id, name: schema.servers.name })
    .from(schema.servers)
    .orderBy(desc(schema.servers.createdAt));

  // If no serverId specified, default to the first server (single-
  // server admins won't have to pick).
  let serverId: number | null = null;
  if (serverIdRaw) {
    const parsed = Number(serverIdRaw);
    if (Number.isInteger(parsed) && parsed > 0) serverId = parsed;
  } else if (servers.length > 0) {
    serverId = servers[0].id;
  }

  if (!serverId) {
    return NextResponse.json({ clans: [], servers });
  }

  const clans = await listClansForServer(serverId);

  // Decorate each clan with its current-season K/D so /dashboard/clans
  // can render the chip without a second round-trip. Batched fetch on
  // clan_stats keyed by IN-list of ids — cheap for the typical
  // <50-clan deployment.
  let statsByClan = new Map<number, { kills: number; deaths: number }>();
  const seasonKey = await ensureSeasonKey(serverId);
  if (clans.length > 0) {
    const rows = await db
      .select({
        clanId: schema.clanStats.clanId,
        kills: schema.clanStats.kills,
        deaths: schema.clanStats.deaths,
      })
      .from(schema.clanStats)
      .where(
        and(
          inArray(schema.clanStats.clanId, clans.map((c) => c.id)),
          eq(schema.clanStats.seasonKey, seasonKey),
        ),
      );
    statsByClan = new Map(rows.map((r) => [r.clanId, { kills: r.kills, deaths: r.deaths }]));
  }
  const enrichedClans = clans.map((c) => {
    const s = statsByClan.get(c.id) ?? { kills: 0, deaths: 0 };
    return {
      ...c,
      stats: {
        kills: s.kills,
        deaths: s.deaths,
        kd: s.deaths > 0 ? s.kills / s.deaths : s.kills,
      },
    };
  });

  return NextResponse.json({
    clans: enrichedClans,
    servers,
    serverId,
    season: seasonKey,
  });
}
