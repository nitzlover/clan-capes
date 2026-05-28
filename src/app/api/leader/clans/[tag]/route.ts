/**
 * Leader-panel clan endpoint. Scoped to the JWT-carrying leader's own
 * clan — any other tag returns 403.
 *
 *   GET    → full clan DTO + banner spec (one round-trip for the page)
 *   PATCH  → edit name / colorHex (leader or deputy)
 *   DELETE → disband (leader only). Same transactional semantics as
 *            the admin route — clan disbanded + every active member
 *            marked left + audited.
 */

import { NextResponse } from 'next/server';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { getBannerByClanId } from '@/lib/server/banner-repo';
import { getClanByTag } from '@/lib/server/clan-repo';
import {
  isColorTaken,
  isValidColor,
} from '@/lib/server/clan-validators';
import { getDb, schema } from '@/lib/server/db';
import { requireLeaderScope } from '@/lib/server/leader-scope';
import {
  isUniqueViolation,
  uniqueConstraintHint,
} from '@/lib/server/pg-errors';
import { getRequestId } from '@/lib/server/request-id';
import {
  ensureSeasonKey,
  getClanStats,
  LIFETIME_SEASON,
} from '@/lib/server/stats-repo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, ctx: { params: Promise<{ tag: string }> }) {
  const { tag } = await ctx.params;
  const scope = await requireLeaderScope(req, tag);
  if (scope instanceof NextResponse) return scope;

  const banner = await getBannerByClanId(scope.clan.id);
  const seasonKey = await ensureSeasonKey(scope.session.serverId);
  const [season, lifetime] = await Promise.all([
    getClanStats(scope.clan.id, seasonKey),
    getClanStats(scope.clan.id, LIFETIME_SEASON),
  ]);

  // Per-member season K/D — single batched read against player_stats
  // for the roster's UUIDs so the panel can render the table without
  // N+1.
  const db = getDb();
  const memberStatsRows = await db
    .select({
      playerUuid: schema.playerStats.playerUuid,
      kills: schema.playerStats.kills,
      deaths: schema.playerStats.deaths,
    })
    .from(schema.playerStats)
    .where(
      and(
        eq(schema.playerStats.serverId, scope.session.serverId),
        eq(schema.playerStats.seasonKey, seasonKey),
        inArray(
          schema.playerStats.playerUuid,
          scope.clan.members.map((m) => m.playerUuid),
        ),
      ),
    );
  const statsByPlayer = new Map(
    memberStatsRows.map((r) => [r.playerUuid.toLowerCase(), r]),
  );
  const memberStats = scope.clan.members.map((m) => {
    const row = statsByPlayer.get(m.playerUuid.toLowerCase()) ?? {
      kills: 0,
      deaths: 0,
    };
    return {
      playerUuid: m.playerUuid,
      kills: row.kills,
      deaths: row.deaths,
      kd: row.deaths > 0 ? row.kills / row.deaths : row.kills,
    };
  });

  return NextResponse.json({
    clan: scope.clan,
    role: scope.role,
    banner: banner ?? null,
    season: seasonKey,
    stats: { season, lifetime },
    memberStats,
  });
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ tag: string }> },
) {
  const { tag: rawTag } = await ctx.params;
  const scope = await requireLeaderScope(req, rawTag);
  if (scope instanceof NextResponse) return scope;
  const { clan, session } = scope;

  let body: { name?: string; colorHex?: string; friendlyFire?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const updates: { name?: string; colorHex?: string; friendlyFire?: boolean } = {};
  if (body.name !== undefined) {
    const n = body.name.trim();
    if (n.length < 1 || n.length > 32) {
      return NextResponse.json({ error: 'name must be 1-32 chars' }, { status: 400 });
    }
    updates.name = n;
  }
  if (body.colorHex !== undefined) {
    if (!isValidColor(body.colorHex)) {
      return NextResponse.json(
        { error: 'colorHex must look like #RRGGBB' },
        { status: 400 },
      );
    }
    if (await isColorTaken(session.serverId, body.colorHex, clan.id)) {
      return NextResponse.json(
        { error: `color ${body.colorHex} already used by another clan` },
        { status: 409 },
      );
    }
    updates.colorHex = body.colorHex.toUpperCase();
  }
  if (body.friendlyFire !== undefined) {
    if (typeof body.friendlyFire !== 'boolean') {
      return NextResponse.json({ error: 'friendlyFire must be a boolean' }, { status: 400 });
    }
    updates.friendlyFire = body.friendlyFire;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'no editable fields' }, { status: 400 });
  }

  const db = getDb();
  const rid = getRequestId(req);
  try {
    await db.transaction(async (tx) => {
      await tx.update(schema.clans).set(updates).where(eq(schema.clans.id, clan.id));
      await tx.insert(schema.audit).values({
        serverId: session.serverId,
        actor: `leader:${session.sub}`,
        action: 'CLAN_EDIT',
        target: clan.tag,
        payload: { ...updates, _rid: rid },
      });
    });
  } catch (e) {
    if (isUniqueViolation(e)) {
      return NextResponse.json(
        { error: uniqueConstraintHint(e), _rid: rid },
        { status: 409, headers: { 'x-request-id': rid } },
      );
    }
    throw e;
  }

  const fresh = await getClanByTag(session.serverId, clan.tag);
  return NextResponse.json(
    { ok: true, clan: fresh, _rid: rid },
    { headers: { 'x-request-id': rid } },
  );
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ tag: string }> },
) {
  const { tag: rawTag } = await ctx.params;
  const scope = await requireLeaderScope(req, rawTag, { leaderOnly: true });
  if (scope instanceof NextResponse) return scope;
  const { clan, session } = scope;

  const db = getDb();
  const now = new Date();
  const rid = getRequestId(req);
  await db.transaction(async (tx) => {
    await tx
      .update(schema.clans)
      .set({ disbandedAt: now })
      .where(eq(schema.clans.id, clan.id));
    await tx
      .update(schema.clanMembers)
      .set({ leftAt: now })
      .where(
        and(
          eq(schema.clanMembers.clanId, clan.id),
          isNull(schema.clanMembers.leftAt),
        ),
      );
    await tx.insert(schema.audit).values({
      serverId: session.serverId,
      actor: `leader:${session.sub}`,
      action: 'CLAN_DISBAND',
      target: clan.tag,
      payload: { members: clan.members.length, _rid: rid },
    });
  });

  return NextResponse.json(
    { ok: true, _rid: rid },
    { headers: { 'x-request-id': rid } },
  );
}
