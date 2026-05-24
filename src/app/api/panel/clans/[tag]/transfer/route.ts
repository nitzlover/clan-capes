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
import { and, desc, eq, isNull } from 'drizzle-orm';
import { requireAuth } from '@/lib/server/auth';
import { getClanByTag } from '@/lib/server/clan-repo';
import { normaliseTag } from '@/lib/server/clan-validators';
import { dbEnabled, getDb, schema } from '@/lib/server/db';

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
    serverId,
    actor: `admin:${user.sub}`,
    action: 'CLAN_TRANSFER',
    target: tag,
    payload: {
      oldLeaderUuid: currentLeader.playerUuid,
      newLeaderUuid: body.newLeaderUuid,
    },
  });

  const dto = await getClanByTag(serverId, tag);
  return NextResponse.json({ ok: true, clan: dto });
}
