/**
 * Transfer leadership atomically — old leader becomes deputy, target
 * becomes leader, `clans.leader_uuid` updates. Same transaction so
 * a crashed write can't leave a clan with two leaders or none.
 *
 * Payload: { newLeaderUuid, actorUuid? }
 */

import { NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { getClanByTag } from '@/lib/server/clan-repo';
import { dbEnabled, getDb, schema } from '@/lib/server/db';
import { requirePluginAuth } from '@/lib/server/plugin-auth';
import { normaliseTag } from '@/lib/server/clan-validators';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export async function POST(
  req: Request,
  ctx: { params: Promise<{ tag: string }> },
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

  let body: { newLeaderUuid?: string; actorUuid?: string };
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

  const db = getDb();
  const clan = await getClanByTag(auth.id, tag);
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
    // Shouldn't happen in steady state — schema invariant — but
    // guard so we never split-brain on bad data.
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

  // Sequential writes: demote old leader → promote new → update
  // clans.leader_uuid. A crash between any two leaves the clan in a
  // weird state, but a follow-up transfer can fix it; data loss is
  // limited to one row's transient inconsistency.
  await db
    .update(schema.clanMembers)
    .set({ role: 'deputy' })
    .where(
      and(
        eq(schema.clanMembers.clanId, clan.id),
        eq(schema.clanMembers.playerUuid, currentLeader.playerUuid),
        isNull(schema.clanMembers.leftAt),
      ),
    );
  await db
    .update(schema.clanMembers)
    .set({ role: 'leader' })
    .where(
      and(
        eq(schema.clanMembers.clanId, clan.id),
        eq(schema.clanMembers.playerUuid, body.newLeaderUuid),
        isNull(schema.clanMembers.leftAt),
      ),
    );
  await db
    .update(schema.clans)
    .set({ leaderUuid: body.newLeaderUuid })
    .where(eq(schema.clans.id, clan.id));

  await db.insert(schema.audit).values({
    serverId: auth.id,
    actor: body.actorUuid
      ? `plugin:${auth.name}:${body.actorUuid}`
      : `plugin:${auth.name}`,
    action: 'CLAN_TRANSFER',
    target: tag,
    payload: {
      oldLeaderUuid: currentLeader.playerUuid,
      newLeaderUuid: body.newLeaderUuid,
    },
  });

  const dto = await getClanByTag(auth.id, tag);
  return NextResponse.json({ ok: true, clan: dto });
}
