/**
 * Mutate or remove an existing member.
 *
 * PATCH — change role between member/deputy. Promoting to leader
 * happens via /transfer (different endpoint) so we never accidentally
 * leave a clan with two leaders.
 *
 * DELETE — kick or self-leave. Sets leftAt on the row, keeping the
 * historical record intact for stats. Rejecting the leader's leave is
 * the plugin's job (must transfer first); we just persist what's asked.
 */

import { NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { getClanByTag } from '@/lib/server/clan-repo';
import { dbEnabled, getDb, schema } from '@/lib/server/db';
import { requirePluginAuth } from '@/lib/server/plugin-auth';
import { normaliseTag } from '@/lib/server/clan-validators';
import { getRequestId } from '@/lib/server/request-id';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ tag: string; uuid: string }> },
) {
  if (!dbEnabled()) {
    return NextResponse.json({ error: 'db disabled' }, { status: 503 });
  }
  const auth = await requirePluginAuth(req);
  if (!auth) {
    return NextResponse.json(
      { error: 'invalid or missing plugin API key' },
      { status: 401 },
    );
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

  let body: { role?: string; actorUuid?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const role = body.role?.toLowerCase();
  if (role !== 'member' && role !== 'deputy') {
    return NextResponse.json(
      { error: 'role must be member or deputy (use /transfer for leader)' },
      { status: 400 },
    );
  }

  const db = getDb();
  const clan = await getClanByTag(auth.id, tag);
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
      { error: "can't demote the leader — use /transfer first" },
      { status: 409 },
    );
  }

  const rid = getRequestId(req);
  await db.transaction(async (tx) => {
    await tx
      .update(schema.clanMembers)
      .set({ role })
      .where(
        and(
          eq(schema.clanMembers.clanId, clan.id),
          eq(schema.clanMembers.playerUuid, uuid),
          isNull(schema.clanMembers.leftAt),
        ),
      );
    await tx.insert(schema.audit).values({
      serverId: auth.id,
      actor: body.actorUuid
        ? `plugin:${auth.name}:${body.actorUuid}`
        : `plugin:${auth.name}`,
      action: 'CLAN_MEMBER_ROLE',
      target: tag,
      payload: { playerUuid: uuid, oldRole: target.role, newRole: role, _rid: rid },
    });
  });

  const dto = await getClanByTag(auth.id, tag);
  return NextResponse.json(
    { ok: true, clan: dto, _rid: rid },
    { headers: { 'x-request-id': rid } },
  );
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ tag: string; uuid: string }> },
) {
  if (!dbEnabled()) {
    return NextResponse.json({ error: 'db disabled' }, { status: 503 });
  }
  const auth = await requirePluginAuth(req);
  if (!auth) {
    return NextResponse.json(
      { error: 'invalid or missing plugin API key' },
      { status: 401 },
    );
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

  let actorUuid: string | undefined;
  try {
    const body = (await req.json()) as { actorUuid?: string };
    actorUuid = body.actorUuid;
  } catch {
    // Body optional.
  }

  const db = getDb();
  const clan = await getClanByTag(auth.id, tag);
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
      { error: "can't remove the leader — disband or transfer first" },
      { status: 409 },
    );
  }

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
      serverId: auth.id,
      actor: actorUuid ? `plugin:${auth.name}:${actorUuid}` : `plugin:${auth.name}`,
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
