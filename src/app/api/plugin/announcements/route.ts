/**
 * Plugin-facing announcement snapshot. Returns one row per active
 * clan on the calling server with whatever announcement body the
 * panel currently holds. Clans without an announcement are omitted
 * (no empty bodies to filter on the plugin side).
 *
 * The plugin's AnnouncementRepository polls this every 5 min and
 * caches by clan tag — same cadence as banners. Single round-trip
 * keeps `/clan info` output snappy without per-clan API calls.
 */

import { NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { dbEnabled, getDb, schema } from '@/lib/server/db';
import { requirePluginAuth } from '@/lib/server/plugin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!dbEnabled()) {
    return NextResponse.json({ announcements: [] });
  }
  const ctx = await requirePluginAuth(req);
  if (!ctx) {
    return NextResponse.json(
      { error: 'invalid or missing plugin API key' },
      { status: 401 },
    );
  }

  const db = getDb();
  const rows = await db
    .select({
      tag: schema.clans.tag,
      body: schema.clanAnnouncements.body,
      updatedAt: schema.clanAnnouncements.updatedAt,
      updatedBy: schema.clanAnnouncements.updatedBy,
    })
    .from(schema.clanAnnouncements)
    .innerJoin(schema.clans, eq(schema.clans.id, schema.clanAnnouncements.clanId))
    .where(and(eq(schema.clans.serverId, ctx.id), isNull(schema.clans.disbandedAt)));

  return NextResponse.json({
    announcements: rows.map((r) => ({
      tag: r.tag,
      body: r.body,
      updatedAt: r.updatedAt.toISOString(),
      updatedBy: r.updatedBy,
    })),
  });
}
