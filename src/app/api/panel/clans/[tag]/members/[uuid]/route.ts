/**
 * Admin member mutations.
 *
 * PATCH — { role?, playerName? }. role flips member ↔ deputy (leader
 * role is locked, transfer via POST /transfer). playerName fixes the
 * display name stored on the member row — useful right after a
 * PowerClans import where the seed name was a placeholder.
 *
 * DELETE — kick / leave (soft, sets leftAt). Leaders can't be removed
 * directly; the panel must transfer first or disband.
 */

import { NextResponse } from 'next/server';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { requireAuth } from '@/lib/server/auth';
import { getClanByTag } from '@/lib/server/clan-repo';
import { normaliseTag } from '@/lib/server/clan-validators';
import { dbEnabled, getDb, schema } from '@/lib/server/db';
import { getRequestId } from '@/lib/server/request-id';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

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

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ tag: string; uuid: string }> },
) {
  const user = requireAuth(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!dbEnabled()) {
    return NextResponse.json({ error: 'db disabled' }, { status: 503 });
  }
  const { tag: rawTag, uuid } = await ctx.params;
  if (!UUID_RE.test(uuid)) {
    return NextResponse.json({ error: 'invalid uuid' }, { status: 400 });
  }
  let tag: string;
  try {
    tag = normaliseTag(rawTag);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'invalid tag' },
      { status: 400 },
    );
  }

  let body: { role?: string; playerName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const serverId = await resolveServerId(req);
  if (!serverId) {
    return NextResponse.json({ error: 'no servers registered' }, { status: 409 });
  }
  const clan = await getClanByTag(serverId, tag);
  if (!clan) {
    return NextResponse.json({ error: 'clan not found' }, { status: 404 });
  }
  const target = clan.members.find((m) => m.playerUuid === uuid);
  if (!target) {
    return NextResponse.json(
      { error: 'player is not in this clan' },
      { status: 404 },
    );
  }

  const updates: { role?: 'member' | 'deputy'; playerName?: string } = {};
  if (body.role !== undefined) {
    const r = body.role.toLowerCase();
    if (r !== 'member' && r !== 'deputy') {
      return NextResponse.json(
        { error: 'role must be member or deputy (use /transfer for leader)' },
        { status: 400 },
      );
    }
    if (target.role === 'leader') {
      return NextResponse.json(
        { error: "can't change the leader's role — use /transfer first" },
        { status: 409 },
      );
    }
    updates.role = r;
  }
  if (body.playerName !== undefined) {
    const n = body.playerName.trim();
    if (n.length < 1 || n.length > 32) {
      return NextResponse.json(
        { error: 'playerName must be 1-32 chars' },
        { status: 400 },
      );
    }
    updates.playerName = n;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: 'no editable fields in body' },
      { status: 400 },
    );
  }

  const db = getDb();
  const rid = getRequestId(req);
  await db.transaction(async (tx) => {
    await tx
      .update(schema.clanMembers)
      .set(updates)
      .where(
        and(
          eq(schema.clanMembers.clanId, clan.id),
          eq(schema.clanMembers.playerUuid, uuid),
          isNull(schema.clanMembers.leftAt),
        ),
      );
    await tx.insert(schema.audit).values({
      serverId,
      actor: `admin:${user.sub}`,
      action: 'CLAN_MEMBER_EDIT',
      target: tag,
      payload: { playerUuid: uuid, oldRole: target.role, ...updates, _rid: rid },
    });
  });

  const dto = await getClanByTag(serverId, tag);
  return NextResponse.json(
    { ok: true, clan: dto, _rid: rid },
    { headers: { 'x-request-id': rid } },
  );
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ tag: string; uuid: string }> },
) {
  const user = requireAuth(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!dbEnabled()) {
    return NextResponse.json({ error: 'db disabled' }, { status: 503 });
  }
  const { tag: rawTag, uuid } = await ctx.params;
  if (!UUID_RE.test(uuid)) {
    return NextResponse.json({ error: 'invalid uuid' }, { status: 400 });
  }
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
  const target = clan.members.find((m) => m.playerUuid === uuid);
  if (!target) {
    return NextResponse.json(
      { error: 'player is not in this clan' },
      { status: 404 },
    );
  }
  if (target.role === 'leader') {
    return NextResponse.json(
      { error: "can't remove the leader — transfer or disband first" },
      { status: 409 },
    );
  }

  const db = getDb();
  const rid = getRequestId(req);
  await db.transaction(async (tx) => {
    await tx
      .update(schema.clanMembers)
      .set({ leftAt: new Date() })
      .where(
        and(
          eq(schema.clanMembers.clanId, clan.id),
          eq(schema.clanMembers.playerUuid, uuid),
          isNull(schema.clanMembers.leftAt),
        ),
      );
    await tx.insert(schema.audit).values({
      serverId,
      actor: `admin:${user.sub}`,
      action: 'CLAN_MEMBER_REMOVE',
      target: tag,
      payload: {
        playerUuid: uuid,
        playerName: target.playerName,
        role: target.role,
        _rid: rid,
      },
    });
  });

  return NextResponse.json(
    { ok: true, _rid: rid },
    { headers: { 'x-request-id': rid } },
  );
}
