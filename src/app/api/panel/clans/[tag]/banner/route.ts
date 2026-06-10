/**
 * DB-backed banner CRUD.
 *
 * `clan_banners` is the single source of truth. The plugin consumes
 * this API — it polls `/api/plugin/banners` and repaints held shields
 * on its own refresh cadence — so these handlers never push to a
 * plugin REST port.
 */

import { NextResponse } from 'next/server';

import { requireAuth } from '@/lib/server/auth';
import { getClanByTag } from '@/lib/server/clan-repo';
import {
  deleteBanner,
  getBannerByClanId,
  upsertBanner,
  type BannerPattern,
} from '@/lib/server/banner-repo';
import { dbEnabled, getDb, schema } from '@/lib/server/db';
import { resolveServerId } from '@/lib/server/resolve-server';
import { getRequestId } from '@/lib/server/request-id';
import { getServerSettings } from '@/lib/server/settings-repo';
import { normaliseTag } from '@/lib/server/clan-validators';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Default cap when the operator hasn't set one via /dashboard/settings;
// real ceiling is pulled per-request from `settings.bannerMaxLayers`
// so an operator can extend (or tighten) without redeploying.
const FALLBACK_MAX_LAYERS = 6;

export async function GET(req: Request, ctx: { params: Promise<{ tag: string }> }) {
  const user = requireAuth(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { tag: rawTag } = await ctx.params;
  let tag: string;
  try {
    tag = normaliseTag(rawTag);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'invalid tag' },
      { status: 400 },
    );
  }

  // Preferred: DB
  if (dbEnabled()) {
    const serverId = await resolveServerId(req);
    if (serverId) {
      const clan = await getClanByTag(serverId, tag);
      if (clan) {
        const banner = await getBannerByClanId(clan.id);
        if (banner) {
          return NextResponse.json({
            clan: tag,
            baseColor: banner.baseColor,
            patterns: banner.patterns,
            updatedAt: banner.updatedAt,
            updatedBy: banner.updatedBy,
          });
        }
        return NextResponse.json({ error: 'not found' }, { status: 404 });
      }
    }
  }

  // No DB row (or DB disabled) → no banner. The plugin polls
  // /api/plugin/banners for the live spec; nothing to proxy here.
  return NextResponse.json({ error: 'not found' }, { status: 404 });
}

export async function POST(req: Request, ctx: { params: Promise<{ tag: string }> }) {
  const user = requireAuth(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!dbEnabled()) {
    return NextResponse.json({ error: 'db disabled' }, { status: 503 });
  }
  const { tag: rawTag } = await ctx.params;
  let tag: string;
  try {
    tag = normaliseTag(rawTag);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'invalid tag' },
      { status: 400 },
    );
  }

  let body: { baseColor?: number; patterns?: BannerPattern[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'json body required' }, { status: 400 });
  }

  const baseColor = Number.isInteger(body.baseColor) ? Number(body.baseColor) : -1;
  if (baseColor < 0 || baseColor > 15) {
    return NextResponse.json({ error: 'baseColor must be 0..15' }, { status: 400 });
  }
  const patterns = Array.isArray(body.patterns) ? body.patterns : [];
  const serverIdForCap = await resolveServerId(req);
  const cap = serverIdForCap
    ? (await getServerSettings(serverIdForCap)).bannerMaxLayers
    : FALLBACK_MAX_LAYERS;
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

  const serverId = await resolveServerId(req);
  if (!serverId) {
    return NextResponse.json({ error: 'no servers registered' }, { status: 409 });
  }
  const clan = await getClanByTag(serverId, tag);
  if (!clan) {
    return NextResponse.json({ error: 'clan not found' }, { status: 404 });
  }

  const rid = getRequestId(req);

  // Durable write. The plugin polls /api/plugin/banners and re-paints
  // held shields on its own refresh cadence — no push needed here.
  const record = await upsertBanner(clan.id, baseColor, patterns, user.sub);
  const db = getDb();
  await db.insert(schema.audit).values({
    serverId,
    actor: `admin:${user.sub}`,
    action: 'BANNER_SET',
    target: tag,
    payload: {
      baseColor,
      layers: patterns.length,
      _rid: rid,
    },
  });

  return NextResponse.json(
    {
      clan: tag,
      baseColor: record.baseColor,
      patterns: record.patterns,
      updatedAt: record.updatedAt,
      updatedBy: record.updatedBy,
      _rid: rid,
    },
    { headers: { 'x-request-id': rid } },
  );
}

export async function DELETE(req: Request, ctx: { params: Promise<{ tag: string }> }) {
  const user = requireAuth(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!dbEnabled()) {
    return NextResponse.json({ error: 'db disabled' }, { status: 503 });
  }
  const { tag: rawTag } = await ctx.params;
  let tag: string;
  try {
    tag = normaliseTag(rawTag);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'invalid tag' },
      { status: 400 },
    );
  }

  const serverId = await resolveServerId(req);
  if (!serverId) {
    return NextResponse.json({ error: 'no servers registered' }, { status: 409 });
  }
  const clan = await getClanByTag(serverId, tag);
  if (!clan) {
    return NextResponse.json({ error: 'clan not found' }, { status: 404 });
  }

  const rid = getRequestId(req);
  await deleteBanner(clan.id);
  const db = getDb();
  await db.insert(schema.audit).values({
    serverId,
    actor: `admin:${user.sub}`,
    action: 'BANNER_DELETE',
    target: tag,
    payload: { _rid: rid },
  });
  return NextResponse.json(
    { ok: true, tag, _rid: rid },
    { headers: { 'x-request-id': rid } },
  );
}
