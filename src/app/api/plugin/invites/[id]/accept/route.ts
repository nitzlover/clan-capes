/**
 * Accept a clan invitation.
 *
 * Atomically: marks the invitation accepted, declines any other
 * pending invites for this player, and inserts the player as a
 * member of the clan. Body:
 *   { playerUuid, playerName, actorUuid? }
 *
 * Requires playerUuid to equal the invitation's inviteeUuid — the
 * plugin's /clan accept gates on the in-game player, and the panel
 * re-verifies so a stray POST can't accept an invite on someone
 * else's behalf.
 */

import { NextResponse } from 'next/server';
import { and, eq, isNull, ne } from 'drizzle-orm';
import { dbEnabled, getDb, schema } from '@/lib/server/db';
import { requirePluginAuth } from '@/lib/server/plugin-auth';
import { getClanByTag } from '@/lib/server/clan-repo';
import {
  isUniqueViolation,
  uniqueConstraintHint,
} from '@/lib/server/pg-errors';
import { getRequestId } from '@/lib/server/request-id';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
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

  const { id: rawId } = await ctx.params;
  const inviteId = Number(rawId);
  if (!Number.isInteger(inviteId) || inviteId <= 0) {
    return NextResponse.json({ error: 'invalid invitation id' }, { status: 400 });
  }

  let body: { playerUuid?: string; playerName?: string; actorUuid?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  if (!body.playerUuid || !UUID_RE.test(body.playerUuid)) {
    return NextResponse.json({ error: 'invalid playerUuid' }, { status: 400 });
  }
  if (
    !body.playerName ||
    body.playerName.length < 1 ||
    body.playerName.length > 32
  ) {
    return NextResponse.json(
      { error: 'playerName must be 1-32 chars' },
      { status: 400 },
    );
  }

  const db = getDb();
  // Load the invitation + its clan in one query so we can authorise
  // the accept and grab the server scope at the same time.
  const [row] = await db
    .select({
      id: schema.clanInvitations.id,
      clanId: schema.clanInvitations.clanId,
      inviteeUuid: schema.clanInvitations.inviteeUuid,
      inviteeName: schema.clanInvitations.inviteeName,
      status: schema.clanInvitations.status,
      expiresAt: schema.clanInvitations.expiresAt,
      clanTag: schema.clans.tag,
      clanServerId: schema.clans.serverId,
    })
    .from(schema.clanInvitations)
    .innerJoin(schema.clans, eq(schema.clanInvitations.clanId, schema.clans.id))
    .where(eq(schema.clanInvitations.id, inviteId))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: 'invitation not found' }, { status: 404 });
  }
  if (row.clanServerId !== auth.id) {
    // Don't leak that the invite exists on another server.
    return NextResponse.json({ error: 'invitation not found' }, { status: 404 });
  }
  if (row.status !== 'pending') {
    return NextResponse.json(
      { error: `invitation is ${row.status}` },
      { status: 409 },
    );
  }
  if (row.expiresAt.getTime() <= Date.now()) {
    return NextResponse.json({ error: 'invitation expired' }, { status: 410 });
  }
  if (row.inviteeUuid.toLowerCase() !== body.playerUuid.toLowerCase()) {
    return NextResponse.json(
      { error: 'invitation is for a different player' },
      { status: 403 },
    );
  }

  // Single-clan-per-player guard. Mirrors the rule on POST /members.
  const otherMembership = await db
    .select({ id: schema.clanMembers.id })
    .from(schema.clanMembers)
    .innerJoin(schema.clans, eq(schema.clanMembers.clanId, schema.clans.id))
    .where(
      and(
        eq(schema.clanMembers.playerUuid, body.playerUuid),
        isNull(schema.clanMembers.leftAt),
        eq(schema.clans.serverId, auth.id),
        isNull(schema.clans.disbandedAt),
      ),
    )
    .limit(1);
  if (otherMembership.length > 0) {
    return NextResponse.json(
      { error: 'you are already in a clan on this server' },
      { status: 409 },
    );
  }

  const rid = getRequestId(req);
  const playerUuid = body.playerUuid;
  const playerName = body.playerName;

  try {
    await db.transaction(async (tx) => {
      // Mark this invitation accepted.
      await tx
        .update(schema.clanInvitations)
        .set({ status: 'accepted' })
        .where(
          and(
            eq(schema.clanInvitations.id, inviteId),
            eq(schema.clanInvitations.status, 'pending'),
          ),
        );

      // Decline every other still-pending invite for this player —
      // accepting one clan implicitly rejects the rest. We scope to
      // the same server via the clan join.
      await tx
        .update(schema.clanInvitations)
        .set({ status: 'declined' })
        .where(
          and(
            eq(schema.clanInvitations.inviteeUuid, playerUuid),
            eq(schema.clanInvitations.status, 'pending'),
            ne(schema.clanInvitations.id, inviteId),
          ),
        );

      await tx.insert(schema.clanMembers).values({
        clanId: row.clanId,
        serverId: auth.id,
        playerUuid,
        playerName,
        role: 'member',
      });

      await tx.insert(schema.audit).values({
        serverId: auth.id,
        actor: body.actorUuid
          ? `plugin:${auth.name}:${body.actorUuid}`
          : `plugin:${auth.name}`,
        action: 'CLAN_INVITE_ACCEPT',
        target: row.clanTag,
        payload: {
          inviteId,
          playerUuid,
          playerName,
          _rid: rid,
        },
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

  const clan = await getClanByTag(auth.id, row.clanTag);
  return NextResponse.json(
    { ok: true, clan, _rid: rid },
    { status: 200, headers: { 'x-request-id': rid } },
  );
}
