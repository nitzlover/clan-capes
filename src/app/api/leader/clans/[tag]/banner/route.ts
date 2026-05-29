/**
 * Leader-panel banner CRUD. Leader or deputy may edit. Same shape as
 * the admin banner endpoint — durable write to `clan_banners`, then a
 * best-effort plugin mirror so held shields re-paint in-game without
 * waiting for the next 5-min poll.
 */

import { NextResponse } from 'next/server';
import {
  deleteBanner,
  upsertBanner,
  type BannerPattern,
} from '@/lib/server/banner-repo';
import { getDb, schema } from '@/lib/server/db';
import { requireLeaderScope } from '@/lib/server/leader-scope';
import { getRequestId } from '@/lib/server/request-id';
import { getServerSettings } from '@/lib/server/settings-repo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Fallback when settings haven't been written yet; real ceiling
// pulled per-request from `settings.bannerMaxLayers`.
const FALLBACK_MAX_LAYERS = 6;

export async function POST(
  req: Request,
  ctx: { params: Promise<{ tag: string }> },
) {
  const { tag: rawTag } = await ctx.params;
  const scope = await requireLeaderScope(req, rawTag);
  if (scope instanceof NextResponse) return scope;
  const { clan, session } = scope;

  let body: { baseColor?: number; patterns?: BannerPattern[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const baseColor = Number.isInteger(body.baseColor) ? Number(body.baseColor) : -1;
  if (baseColor < 0 || baseColor > 15) {
    return NextResponse.json({ error: 'baseColor must be 0..15' }, { status: 400 });
  }
  const patterns = Array.isArray(body.patterns) ? body.patterns : [];
  // Use ?? not || — an operator-set bannerMaxLayers=1 is a legitimate
  // tighter limit, not a falsy value that should fall back to 6.
  const cap = (await getServerSettings(session.serverId)).bannerMaxLayers
    ?? FALLBACK_MAX_LAYERS;
  if (patterns.length > cap) {
    return NextResponse.json(
      { error: `too many layers (max ${cap})` },
      { status: 400 },
    );
  }
  for (const p of patterns) {
    if (
      !p ||
      typeof p.pattern !== 'string' ||
      !p.pattern.length ||
      !Number.isInteger(p.color) ||
      p.color < 0 ||
      p.color > 15
    ) {
      return NextResponse.json({ error: 'invalid pattern entry' }, { status: 400 });
    }
  }

  const rid = getRequestId(req);
  // Durable write only — the plugin polls /api/plugin/banners and
  // re-paints on its refresh cadence, so there's no push from here.
  const record = await upsertBanner(clan.id, baseColor, patterns, `leader:${session.sub}`);
  const db = getDb();
  await db.insert(schema.audit).values({
    serverId: session.serverId,
    actor: `leader:${session.sub}`,
    action: 'BANNER_SET',
    target: clan.tag,
    payload: {
      baseColor,
      layers: patterns.length,
      _rid: rid,
    },
  });

  return NextResponse.json(
    {
      clan: clan.tag,
      baseColor: record.baseColor,
      patterns: record.patterns,
      updatedAt: record.updatedAt,
      updatedBy: record.updatedBy,
      _rid: rid,
    },
    { headers: { 'x-request-id': rid } },
  );
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ tag: string }> },
) {
  const { tag: rawTag } = await ctx.params;
  const scope = await requireLeaderScope(req, rawTag);
  if (scope instanceof NextResponse) return scope;
  const { clan, session } = scope;

  const rid = getRequestId(req);
  await deleteBanner(clan.id);
  const db = getDb();
  await db.insert(schema.audit).values({
    serverId: session.serverId,
    actor: `leader:${session.sub}`,
    action: 'BANNER_DELETE',
    target: clan.tag,
    payload: { _rid: rid },
  });
  return NextResponse.json(
    { ok: true, tag: clan.tag, _rid: rid },
    { headers: { 'x-request-id': rid } },
  );
}
