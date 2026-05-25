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
import * as mc from '@/lib/server/minecraft';
import { getRequestId } from '@/lib/server/request-id';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_LAYERS = 6;

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
  if (patterns.length > MAX_LAYERS) {
    return NextResponse.json(
      { error: `too many layers (max ${MAX_LAYERS})` },
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
  const record = await upsertBanner(clan.id, baseColor, patterns, `leader:${session.sub}`);
  let pluginMirrored = true;
  let pluginErr: string | null = null;
  try {
    await mc.setClanBanner(clan.tag, baseColor, patterns, `leader:${session.sub}`, rid);
  } catch (e) {
    pluginMirrored = false;
    pluginErr = e instanceof Error ? e.message : String(e);
  }
  const db = getDb();
  await db.insert(schema.audit).values({
    serverId: session.serverId,
    actor: `leader:${session.sub}`,
    action: 'BANNER_SET',
    target: clan.tag,
    payload: {
      baseColor,
      layers: patterns.length,
      pluginMirrored,
      pluginErr,
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
      pluginMirrored,
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
  try {
    await mc.deleteClanBanner(clan.tag, rid);
  } catch {
    // Mirror failure is non-fatal; audit captures it implicitly via
    // the next BannerRepository refresh diff.
  }
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
