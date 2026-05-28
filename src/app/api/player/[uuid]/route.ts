/**
 * Public player cape spec — feeds the Fabric client mod's CapeApiClient.
 *
 * Mirrors the legacy plugin REST endpoint that no longer exists: the new
 * Paper plugin is a *consumer* of the panel API, not a producer, so the
 * panel itself now serves /api/player/{uuid} directly. The Fabric mod
 * keeps hitting the same URL it always did — only the upstream changed.
 *
 * Capes are stored on the panel's filesystem under UPLOAD_DIR as
 * `<TAG>.png`. The URL we hand back is CDN_PUBLIC_URL/<TAG>.png?v=<mtime>
 * so the mod's HTTP cache invalidates the moment the operator re-uploads
 * a cape — no DB column for cape revision required.
 *
 * Unauthenticated by design (so any client can render any clan member's
 * cape). IP rate-limited to stop scraping or download-loop floods.
 *
 * Response (matches PlayerCapeResponse in the Fabric mod):
 *   { hasCape: true, capeUrl: "https://…/KING.png?v=…", clan: "KING", updatedAt: 1717000000000 }
 *
 * When the player has no active clan or the clan has no cape on disk:
 *   { hasCape: false, capeUrl: null, clan: null, updatedAt: 0 }
 */

import fs from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { dbEnabled, getDb, schema } from '@/lib/server/db';
import { CDN_PUBLIC_URL } from '@/lib/server/env';
import { limit } from '@/lib/server/rate-limit';
import { capeFilePath } from '@/lib/server/storage';
import { tryNormaliseUuid } from '@/lib/server/uuid';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 60 requests / minute / IP — generous enough for a Fabric mod that
// only refreshes on world-join + manual reload, tight enough to stop
// a script from sweeping the UUID space.
const RATE_MAX = 60;
const RATE_WINDOW_MS = 60_000;

type Empty = { hasCape: false; capeUrl: null; clan: string | null; updatedAt: 0 };
const empty = (clan: string | null = null): Empty => ({
  hasCape: false,
  capeUrl: null,
  clan,
  updatedAt: 0,
});

export async function GET(
  req: Request,
  ctx: { params: Promise<{ uuid: string }> },
) {
  if (!limit(req, 'player-cape', RATE_MAX, RATE_WINDOW_MS)) {
    return NextResponse.json({ error: 'rate limit' }, { status: 429 });
  }

  if (!dbEnabled()) {
    return NextResponse.json(empty());
  }

  const { uuid: rawUuid } = await ctx.params;
  const uuid = tryNormaliseUuid(rawUuid);
  if (!uuid) {
    return NextResponse.json({ error: 'invalid uuid' }, { status: 400 });
  }

  const db = getDb();

  // First active membership wins — the trims route uses the same
  // strategy so capes + trims agree on which clan to render for a
  // player that's somehow active on two servers at once.
  const membership = await db
    .select({ tag: schema.clans.tag })
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
    return NextResponse.json(empty());
  }

  const tag = membership[0].tag;

  // Cape existence + revision = filesystem mtime. The upload route
  // writes UPLOAD_DIR/<TAG>.png on success; absence means no cape.
  let mtime = 0;
  try {
    const stat = await fs.stat(capeFilePath(tag));
    mtime = stat.mtimeMs;
  } catch {
    return NextResponse.json(empty(tag));
  }

  const capeUrl = `${CDN_PUBLIC_URL}/${tag}.png?v=${Math.floor(mtime)}`;

  return NextResponse.json({
    hasCape: true,
    capeUrl,
    clan: tag,
    updatedAt: Math.floor(mtime),
  });
}
