/**
 * Leader-panel: remove a member (kick). Leader or deputy may kick a
 * member, but neither can kick the leader; transfer first.
 *
 * Marks `clan_members.left_at = now()`, keeps the row for stats /
 * audit history, drops them off the partial-unique active-membership
 * index so they can re-join a different clan.
 */

import { NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { getDb, schema } from '@/lib/server/db';
import { requireLeaderScope } from '@/lib/server/leader-scope';
import { getRequestId } from '@/lib/server/request-id';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ tag: string; uuid: string }> },
) {
  const { tag: rawTag, uuid } = await ctx.params;
  if (!UUID_RE.test(uuid)) {
    return NextResponse.json({ error: 'invalid uuid' }, { status: 400 });
  }
  const scope = await requireLeaderScope(req, rawTag);
  if (scope instanceof NextResponse) return scope;
  const { clan, session } = scope;

  const target = clan.members.find(
    (m) => m.playerUuid.toLowerCase() === uuid.toLowerCase(),
  );
  if (!target) {
    return NextResponse.json({ error: 'player not in this clan' }, { status: 404 });
  }
  if (target.role === 'leader') {
    return NextResponse.json(
      { error: 'cannot remove the leader — transfer first' },
      { status: 409 },
    );
  }
  // Deputies can only kick members, not other deputies. Leaders may
  // kick anyone except themselves (guarded above).
  if (scope.role === 'deputy' && target.role === 'deputy') {
    return NextResponse.json(
      { error: 'deputies cannot remove other deputies — ask the leader' },
      { status: 403 },
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
          eq(schema.clanMembers.playerUuid, target.playerUuid),
          isNull(schema.clanMembers.leftAt),
        ),
      );
    await tx.insert(schema.audit).values({
      serverId: session.serverId,
      actor: `leader:${session.sub}`,
      action: 'CLAN_MEMBER_REMOVE',
      target: clan.tag,
      payload: {
        playerUuid: target.playerUuid,
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
