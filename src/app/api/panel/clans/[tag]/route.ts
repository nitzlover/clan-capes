/**
 * Admin clan endpoints — GET (legacy plugin proxy + DB lookup) plus
 * PATCH (edit name / colour) and DELETE (disband). All three accept
 * admin JWT and read the target server id from the `?serverId=…`
 * query parameter (defaults to the most-recently-registered server
 * to match how /dashboard/clans selects).
 *
 * DB writes mirror the rules enforced by the plugin Bearer endpoints
 * — colour collision rejection, soft-disband semantics, audit row
 * per mutation — but the actor on each audit entry is
 * `admin:<username>` instead of `plugin:<server-name>` so admin
 * actions stay greppable.
 */

import { NextResponse } from 'next/server';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { requireAuth } from '@/lib/server/auth';
import { getClanByTag } from '@/lib/server/clan-repo';
import {
  isColorTaken,
  isValidColor,
  normaliseTag,
} from '@/lib/server/clan-validators';
import { dbEnabled, getDb, schema } from '@/lib/server/db';
import * as mc from '@/lib/server/minecraft';
import {
  isUniqueViolation,
  uniqueConstraintHint,
} from '@/lib/server/pg-errors';
import { getRequestId } from '@/lib/server/request-id';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Pull the operative server id off the request: explicit
 * `?serverId=N`, falling back to the most-recently-registered
 * server. Returns null when DB is unset.
 */
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
  const { tag } = await ctx.params;

  // Prefer the DB row when DB has anything for the chosen server;
  // fall back to the plugin proxy so the legacy /dashboard/capes +
  // /dashboard/banners flows keep working on a pre-migration deploy.
  if (dbEnabled()) {
    const serverId = await resolveServerId(req);
    if (serverId) {
      const dto = await getClanByTag(serverId, tag.toUpperCase());
      if (dto) return NextResponse.json({ source: 'db', clan: dto });
    }
  }
  const data = await mc.fetchClan(tag.toUpperCase());
  if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ source: 'plugin', ...data });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ tag: string }> }) {
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

  let body: { name?: string; colorHex?: string; friendlyFire?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const serverId = await resolveServerId(req);
  if (!serverId) {
    return NextResponse.json({ error: 'no servers registered' }, { status: 409 });
  }
  const existing = await getClanByTag(serverId, tag);
  if (!existing) {
    return NextResponse.json({ error: 'clan not found' }, { status: 404 });
  }

  const updates: { name?: string; colorHex?: string; friendlyFire?: boolean } = {};
  if (body.name !== undefined) {
    const n = body.name.trim();
    if (n.length < 1 || n.length > 32) {
      return NextResponse.json(
        { error: 'name must be 1-32 chars' },
        { status: 400 },
      );
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
    if (await isColorTaken(serverId, body.colorHex, existing.id)) {
      return NextResponse.json(
        { error: `color ${body.colorHex} already used by another clan` },
        { status: 409 },
      );
    }
    updates.colorHex = body.colorHex.toUpperCase();
  }
  if (body.friendlyFire !== undefined) {
    if (typeof body.friendlyFire !== 'boolean') {
      return NextResponse.json(
        { error: 'friendlyFire must be a boolean' },
        { status: 400 },
      );
    }
    updates.friendlyFire = body.friendlyFire;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: 'no editable fields in body' },
      { status: 400 },
    );
  }

  const db = getDb();
  const rid = getRequestId(req);

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(schema.clans)
        .set(updates)
        .where(eq(schema.clans.id, existing.id));
      await tx.insert(schema.audit).values({
        serverId,
        actor: `admin:${user.sub}`,
        action: 'CLAN_EDIT',
        target: tag,
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

  const dto = await getClanByTag(serverId, tag);
  return NextResponse.json(
    { ok: true, clan: dto, _rid: rid },
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
  const existing = await getClanByTag(serverId, tag);
  if (!existing) {
    return NextResponse.json({ error: 'clan not found' }, { status: 404 });
  }

  const db = getDb();
  const now = new Date();
  const rid = getRequestId(req);

  // Tx: stamp disband + drain all active memberships atomically.
  // Without the tx an interrupted disband leaves members "active" in
  // a disbanded clan, which the partial-unique membership index would
  // then block from re-joining a new one.
  await db.transaction(async (tx) => {
    await tx
      .update(schema.clans)
      .set({ disbandedAt: now })
      .where(eq(schema.clans.id, existing.id));
    await tx
      .update(schema.clanMembers)
      .set({ leftAt: now })
      .where(
        and(
          eq(schema.clanMembers.clanId, existing.id),
          isNull(schema.clanMembers.leftAt),
        ),
      );
    await tx.insert(schema.audit).values({
      serverId,
      actor: `admin:${user.sub}`,
      action: 'CLAN_DISBAND',
      target: tag,
      payload: { members: existing.members.length, _rid: rid },
    });
  });

  return NextResponse.json(
    { ok: true, _rid: rid },
    { headers: { 'x-request-id': rid } },
  );
}
