/**
 * Leader-panel: transfer leadership. Leader-only.
 *
 * Same atomic semantics as the admin and plugin transfer routes —
 * demote current leader → deputy, promote target → leader, update
 * `clans.leader_uuid`, audit. The single transaction prevents a
 * crashed write from leaving the clan with two leaders or none.
 *
 * Body: { newLeaderUuid: string }
 */

import { NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { getClanByTag } from '@/lib/server/clan-repo';
import { getDb, schema } from '@/lib/server/db';
import { requireLeaderScope } from '@/lib/server/leader-scope';
import { getRequestId } from '@/lib/server/request-id';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export async function POST(
  req: Request,
  ctx: { params: Promise<{ tag: string }> },
) {
  const { tag: rawTag } = await ctx.params;
  const scope = await requireLeaderScope(req, rawTag, { leaderOnly: true });
  if (scope instanceof NextResponse) return scope;
  const { clan, session } = scope;

  let body: { newLeaderUuid?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  if (!body.newLeaderUuid || !UUID_RE.test(body.newLeaderUuid)) {
    return NextResponse.json({ error: 'invalid newLeaderUuid' }, { status: 400 });
  }
  const newLeaderUuid = body.newLeaderUuid.toLowerCase();

  const target = clan.members.find(
    (m) => m.playerUuid.toLowerCase() === newLeaderUuid,
  );
  if (!target) {
    return NextResponse.json(
      { error: 'target is not a member of this clan' },
      { status: 404 },
    );
  }
  const currentLeader = clan.members.find((m) => m.role === 'leader');
  if (!currentLeader) {
    return NextResponse.json(
      { error: 'clan has no leader; cannot transfer' },
      { status: 500 },
    );
  }
  if (currentLeader.playerUuid.toLowerCase() === newLeaderUuid) {
    return NextResponse.json(
      { error: 'target is already the leader' },
      { status: 409 },
    );
  }

  const db = getDb();
  const rid = getRequestId(req);
  await db.transaction(async (tx) => {
    await tx
      .update(schema.clanMembers)
      .set({ role: 'deputy' })
      .where(
        and(
          eq(schema.clanMembers.clanId, clan.id),
          eq(schema.clanMembers.playerUuid, currentLeader.playerUuid),
          isNull(schema.clanMembers.leftAt),
        ),
      );
    await tx
      .update(schema.clanMembers)
      .set({ role: 'leader' })
      .where(
        and(
          eq(schema.clanMembers.clanId, clan.id),
          eq(schema.clanMembers.playerUuid, newLeaderUuid),
          isNull(schema.clanMembers.leftAt),
        ),
      );
    await tx
      .update(schema.clans)
      .set({ leaderUuid: newLeaderUuid })
      .where(eq(schema.clans.id, clan.id));
    await tx.insert(schema.audit).values({
      serverId: session.serverId,
      actor: `leader:${session.sub}`,
      action: 'CLAN_TRANSFER',
      target: clan.tag,
      payload: {
        oldLeaderUuid: currentLeader.playerUuid,
        newLeaderUuid,
        _rid: rid,
      },
    });
  });

  const fresh = await getClanByTag(session.serverId, clan.tag);
  return NextResponse.json(
    { ok: true, clan: fresh, _rid: rid },
    { headers: { 'x-request-id': rid } },
  );
}
