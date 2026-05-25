/**
 * Plugin-facing player stats lookup.
 *
 * Returns both season + lifetime totals in one round-trip so the
 * placeholder cache only needs a single fetch per refresh window.
 * Bearer auth keeps random scrapers from churning the DB.
 *
 *   { season: { key, kills, deaths, kd },
 *     lifetime: { kills, deaths, kd } }
 */

import { NextResponse } from 'next/server';
import { dbEnabled } from '@/lib/server/db';
import { requirePluginAuth } from '@/lib/server/plugin-auth';
import {
  ensureSeasonKey,
  getPlayerStats,
  LIFETIME_SEASON,
} from '@/lib/server/stats-repo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export async function GET(
  req: Request,
  ctx: { params: Promise<{ uuid: string }> },
) {
  if (!dbEnabled()) {
    return NextResponse.json({ error: 'db disabled' }, { status: 503 });
  }
  const auth = await requirePluginAuth(req);
  if (!auth) {
    return NextResponse.json(
      { error: 'invalid or missing plugin API key' },
      { status: 401 },
    );
  }

  const { uuid } = await ctx.params;
  if (!UUID_RE.test(uuid)) {
    return NextResponse.json({ error: 'invalid uuid' }, { status: 400 });
  }
  const playerUuid = uuid.toLowerCase();
  const seasonKey = await ensureSeasonKey(auth.id);

  const [season, lifetime] = await Promise.all([
    getPlayerStats(auth.id, playerUuid, seasonKey),
    getPlayerStats(auth.id, playerUuid, LIFETIME_SEASON),
  ]);

  return NextResponse.json({
    playerUuid,
    season: { key: seasonKey, ...season },
    lifetime,
  });
}
