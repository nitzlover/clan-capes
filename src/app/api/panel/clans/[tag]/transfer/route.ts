/**
 * Admin leadership transfer — same shape as the plugin's
 * /api/plugin/clans/[tag]/transfer endpoint but admin-authenticated.
 *
 * Sequential writes: demote current leader → deputy, promote new
 * leader, update clans.leader_uuid. No transaction wrapper; a crash
 * between writes leaves the row in a recoverable mid-state and a
 * second transfer call can clean it.
 */

import { NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { requireAuth } from '@/lib/server/auth';
import { getClanByTag } from '@/lib/server/clan-repo';
import { normaliseTag } from '@/lib/server/clan-validators';
import { dbEnabled, getDb, schema } from '@/lib/server/db';
import { resolveServerId } from '@/lib/server/resolve-server';
import { getRequestId } from '@/lib/server/request-id';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export async function POST(
  req: Request,
  ctx: { params: Promise<{ tag: string }> },
) {
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

  let body: { newLeaderUuid?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  if (!body.newLeaderUuid || !UUID_RE.test(body.newLeaderUuid)) {
    return NextResponse.json(
      { error: 'invalid newLeaderUuid' },
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
  const target = clan.members.find((m) => m.playerUuid === body.newLeaderUuid);
  if (!target) {
    return NextResponse.json(
      { error: 'target player is not a member of this clan' },
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
  if (currentLeader.playerUuid === body.newLeaderUuid) {
    return NextResponse.json(
      { error: 'target is already the leader' },
      { status: 409 },
    );
  }

  const db = getDb();
  const rid = getRequestId(req);
  const newLeaderUuid = body.newLeaderUuid!;

  // All three writes + audit in a single transaction. Without the tx
  // a crash between the demote and promote left the clan with no
  // leader; now Postgres rolls everything back atomically.
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
      serverId,
      actor: `admin:${user.sub}`,
      action: 'CLAN_TRANSFER',
      target: tag,
      payload: {
        oldLeaderUuid: currentLeader.playerUuid,
        newLeaderUuid,
        _rid: rid,
      },
    });
  });

  const dto = await getClanByTag(serverId, tag);
  return NextResponse.json(
    { ok: true, clan: dto, _rid: rid },
    { headers: { 'x-request-id': rid } },
  );
}
