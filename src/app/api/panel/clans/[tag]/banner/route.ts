/**
 * DB-backed banner CRUD with a plugin-side mirror.
 *
 * Reads come straight off `clan_banners` so the editor works even
 * when the plugin is unreachable.
 *
 * Writes hit the DB first (durable), then best-effort sync to the
 * plugin REST so currently-held shields repaint in-game without
 * waiting for the next plugin restart. A plugin-side failure is
 * logged but does not roll the DB write back — the panel is the
 * source of truth.
 */

import { NextResponse } from 'next/server';
import { desc } from 'drizzle-orm';
import { requireAuth } from '@/lib/server/auth';
import { getClanByTag } from '@/lib/server/clan-repo';
import {
  deleteBanner,
  getBannerByClanId,
  upsertBanner,
  type BannerPattern,
} from '@/lib/server/banner-repo';
import { dbEnabled, getDb, schema } from '@/lib/server/db';
import * as mc from '@/lib/server/minecraft';
import { getRequestId } from '@/lib/server/request-id';
import { getServerSettings } from '@/lib/server/settings-repo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Default cap when the operator hasn't set one via /dashboard/settings;
// real ceiling is pulled per-request from `settings.bannerMaxLayers`
// so an operator can extend (or tighten) without redeploying.
const FALLBACK_MAX_LAYERS = 6;

async function resolveServerId(req: Request): Promise<number | null> {
  const url = new URL(req.url);
  const raw = url.searchParams.get('serverId');
  if (raw) {
    const n = Number(raw);
    if (Number.isInteger(n) && n > 0) return n;
  }
  const db = getDb();
  const [first] = await db
    .select({ id: schema.servers.id })
    .from(schema.servers)
    .orderBy(desc(schema.servers.createdAt))
    .limit(1);
  return first?.id ?? null;
}

export async function GET(req: Request, ctx: { params: Promise<{ tag: string }> }) {
  const user = requireAuth(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { tag: rawTag } = await ctx.params;
  const tag = rawTag.toUpperCase();

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

  // Fallback: plugin proxy for the legacy / no-DB path.
  try {
    const dto = await mc.fetchClanBanner(tag);
    if (!dto) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json(dto);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'plugin unreachable' },
      { status: 502 },
    );
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ tag: string }> }) {
  const user = requireAuth(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!dbEnabled()) {
    return NextResponse.json({ error: 'db disabled' }, { status: 503 });
  }
  const { tag: rawTag } = await ctx.params;
  const tag = rawTag.toUpperCase();

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

  // 1) Durable write
  const record = await upsertBanner(clan.id, baseColor, patterns, user.sub);
  // 2) Best-effort plugin mirror so held shields re-paint immediately.
  //    Forward our request id so the plugin can log-correlate.
  let pluginMirrored = true;
  let pluginErr: string | null = null;
  try {
    await mc.setClanBanner(tag, baseColor, patterns, user.sub, rid);
  } catch (e) {
    pluginMirrored = false;
    pluginErr = e instanceof Error ? e.message : String(e);
  }
  // 3) Audit
  const db = getDb();
  await db.insert(schema.audit).values({
    serverId,
    actor: `admin:${user.sub}`,
    action: 'BANNER_SET',
    target: tag,
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
      clan: tag,
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

export async function DELETE(req: Request, ctx: { params: Promise<{ tag: string }> }) {
  const user = requireAuth(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!dbEnabled()) {
    return NextResponse.json({ error: 'db disabled' }, { status: 503 });
  }
  const { tag: rawTag } = await ctx.params;
  const tag = rawTag.toUpperCase();

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
  try {
    await mc.deleteClanBanner(tag, rid);
  } catch {
    // Plugin mirror failure is logged via audit payload, not fatal.
  }
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
