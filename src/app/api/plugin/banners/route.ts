/**
 * Plugin-facing bulk banner list — every clan on this server that has
 * a banner spec registered. Plugin prime its BannerRepository cache
 * with one call instead of N per-tag lookups.
 *
 * Bearer auth. Response shape:
 *
 *   { banners: [
 *       { clan: "KING", baseColor: 4, patterns: [...], updatedAt: ISO, updatedBy: "…" },
 *       ...
 *     ] }
 *
 * Clans without a banner are simply absent. Disbanded clans never
 * appear because their FK cascade already deleted the banner row.
 */

import { NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { dbEnabled, getDb, schema } from '@/lib/server/db';
import { requirePluginAuth } from '@/lib/server/plugin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!dbEnabled()) {
    return NextResponse.json({ banners: [] });
  }
  const auth = await requirePluginAuth(req);
  if (!auth) {
    return NextResponse.json(
      { error: 'invalid or missing plugin API key' },
      { status: 401 },
    );
  }

  const db = getDb();
  const rows = await db
    .select({
      tag: schema.clans.tag,
      baseColor: schema.clanBanners.baseColor,
      patterns: schema.clanBanners.patterns,
      updatedAt: schema.clanBanners.updatedAt,
      updatedBy: schema.clanBanners.updatedBy,
    })
    .from(schema.clanBanners)
    .innerJoin(schema.clans, eq(schema.clans.id, schema.clanBanners.clanId))
    .where(
      and(
        eq(schema.clans.serverId, auth.id),
        isNull(schema.clans.disbandedAt),
      ),
    );

  return NextResponse.json({
    banners: rows.map((r) => ({
      clan: r.tag,
      baseColor: r.baseColor,
      patterns: r.patterns,
      updatedAt: r.updatedAt.toISOString(),
      updatedBy: r.updatedBy,
    })),
  });
}
