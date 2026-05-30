/**
 * Decline a clan invitation.
 *
 * Marks the invitation declined; the row stays for audit / "why
 * isn't there a notification anymore" debugging until the periodic
 * sweep job removes expired/declined rows.
 *
 * Body: { playerUuid, actorUuid? } — playerUuid must match the
 * invitation's inviteeUuid.
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { dbEnabled, getDb, schema } from '@/lib/server/db';
import { requirePluginAuth } from '@/lib/server/plugin-auth';
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

  let body: { playerUuid?: string; actorUuid?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  if (!body.playerUuid || !UUID_RE.test(body.playerUuid)) {
    return NextResponse.json({ error: 'invalid playerUuid' }, { status: 400 });
  }

  const db = getDb();
  const [row] = await db
    .select({
      id: schema.clanInvitations.id,
      inviteeUuid: schema.clanInvitations.inviteeUuid,
      status: schema.clanInvitations.status,
      clanTag: schema.clans.tag,
      clanServerId: schema.clans.serverId,
    })
    .from(schema.clanInvitations)
    .innerJoin(schema.clans, eq(schema.clanInvitations.clanId, schema.clans.id))
    .where(eq(schema.clanInvitations.id, inviteId))
    .limit(1);

  if (!row || row.clanServerId !== auth.id) {
    return NextResponse.json({ error: 'invitation not found' }, { status: 404 });
  }
  if (row.status !== 'pending') {
    return NextResponse.json(
      { error: `invitation is ${row.status}` },
      { status: 409 },
    );
  }
  if (row.inviteeUuid.toLowerCase() !== body.playerUuid.toLowerCase()) {
    return NextResponse.json(
      { error: 'invitation is for a different player' },
      { status: 403 },
    );
  }

  const rid = getRequestId(req);
  await db.transaction(async (tx) => {
    await tx
      .update(schema.clanInvitations)
      .set({ status: 'declined' })
      .where(
        and(
          eq(schema.clanInvitations.id, inviteId),
          eq(schema.clanInvitations.status, 'pending'),
        ),
      );

    await tx.insert(schema.audit).values({
      serverId: auth.id,
      actor: body.actorUuid
        ? `plugin:${auth.name}:${body.actorUuid}`
        : `plugin:${auth.name}`,
      action: 'CLAN_INVITE_DECLINE',
      target: row.clanTag,
      payload: {
        inviteId,
        playerUuid: body.playerUuid,
        _rid: rid,
      },
    });
  });

  return NextResponse.json(
    { ok: true, _rid: rid },
    { status: 200, headers: { 'x-request-id': rid } },
  );
}
