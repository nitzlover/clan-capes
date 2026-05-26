/**
 * Plugin-facing bulk armour trim list — every (clan, slot, material,
 * pattern) row for active clans on this server. Plugin primes its
 * in-memory ArmorTrimRepository cache with one call.
 *
 * Bearer auth. Response:
 *
 *   { trims: [
 *       { clan: "KING", slot: "head", material: "diamond", pattern: "sentry",
 *         updatedAt: ISO, updatedBy: "…" },
 *       ...
 *     ] }
 */

import { NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { dbEnabled, getDb, schema } from '@/lib/server/db';
import { requirePluginAuth } from '@/lib/server/plugin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!dbEnabled()) {
    return NextResponse.json({ trims: [] });
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
      slot: schema.clanArmorTrims.slot,
      material: schema.clanArmorTrims.material,
      pattern: schema.clanArmorTrims.pattern,
      updatedAt: schema.clanArmorTrims.updatedAt,
      updatedBy: schema.clanArmorTrims.updatedBy,
    })
    .from(schema.clanArmorTrims)
    .innerJoin(schema.clans, eq(schema.clans.id, schema.clanArmorTrims.clanId))
    .where(
      and(
        eq(schema.clans.serverId, auth.id),
        isNull(schema.clans.disbandedAt),
      ),
    );

  return NextResponse.json({
    trims: rows.map((r) => ({
      clan: r.tag,
      slot: r.slot,
      material: r.material,
      pattern: r.pattern,
      updatedAt: r.updatedAt.toISOString(),
      updatedBy: r.updatedBy,
    })),
  });
}
