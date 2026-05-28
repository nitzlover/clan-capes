/**
 * Public player trim spec — feeds the Fabric client mod's
 * HumanoidArmorLayerMixin so clan armor trims render on every client
 * regardless of whether the server is sending the ArmorTrim data
 * component on the ItemStack.
 *
 * Unauthenticated by design. Returns the active clan's per-slot trim
 * spec or an empty object if the player is not in a clan. The fabric
 * mod can cache aggressively — the response carries an `updatedAt`
 * stamp so the mod skips re-applying when nothing changed.
 *
 * Response:
 *   { hasTrims: true, clan: "KING",
 *     trims: { head: {material, pattern}, chest: {...}, ... },
 *     updatedAt: 1717000000000 }
 *
 * If the player is not in a clan or the clan has no trims:
 *   { hasTrims: false, clan: null, trims: {}, updatedAt: 0 }
 */

import { NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { dbEnabled, getDb, schema } from '@/lib/server/db';
import { limit } from '@/lib/server/rate-limit';
import { tryNormaliseUuid } from '@/lib/server/uuid';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 60 requests / minute / IP — same budget as the cape sibling route.
// Fabric mod fetches both on world-join, so they share a sane ceiling.
const RATE_MAX = 60;
const RATE_WINDOW_MS = 60_000;

export async function GET(
  req: Request,
  ctx: { params: Promise<{ uuid: string }> },
) {
  if (!limit(req, 'player-trims', RATE_MAX, RATE_WINDOW_MS)) {
    return NextResponse.json({ error: 'rate limit' }, { status: 429 });
  }
  if (!dbEnabled()) {
    return NextResponse.json({ hasTrims: false, clan: null, trims: {}, updatedAt: 0 });
  }
  const { uuid: rawUuid } = await ctx.params;
  const uuid = tryNormaliseUuid(rawUuid);
  if (!uuid) {
    return NextResponse.json({ error: 'invalid uuid' }, { status: 400 });
  }

  const db = getDb();

  // Find this player's active membership across any server. The fabric
  // mod doesn't know the serverId so we accept the first match — if a
  // player is somehow active on two servers at once, the first wins.
  const membership = await db
    .select({ clanId: schema.clanMembers.clanId, tag: schema.clans.tag })
    .from(schema.clanMembers)
    .innerJoin(schema.clans, eq(schema.clans.id, schema.clanMembers.clanId))
    .where(
      and(
        eq(schema.clanMembers.playerUuid, uuid),
        isNull(schema.clanMembers.leftAt),
        isNull(schema.clans.disbandedAt),
      ),
    )
    .limit(1);

  if (membership.length === 0) {
    return NextResponse.json({ hasTrims: false, clan: null, trims: {}, updatedAt: 0 });
  }

  const { clanId, tag } = membership[0];
  const trims = await db
    .select({
      slot: schema.clanArmorTrims.slot,
      material: schema.clanArmorTrims.material,
      pattern: schema.clanArmorTrims.pattern,
      updatedAt: schema.clanArmorTrims.updatedAt,
    })
    .from(schema.clanArmorTrims)
    .where(eq(schema.clanArmorTrims.clanId, clanId));

  if (trims.length === 0) {
    return NextResponse.json({ hasTrims: false, clan: tag, trims: {}, updatedAt: 0 });
  }

  const slotMap: Record<string, { material: string; pattern: string }> = {};
  let latest = 0;
  for (const t of trims) {
    slotMap[t.slot] = { material: t.material, pattern: t.pattern };
    const ts = t.updatedAt.getTime();
    if (ts > latest) latest = ts;
  }

  return NextResponse.json({
    hasTrims: true,
    clan: tag,
    trims: slotMap,
    updatedAt: latest,
  });
}
