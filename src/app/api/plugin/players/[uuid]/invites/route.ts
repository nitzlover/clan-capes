/**
 * List pending clan invitations for a player.
 *
 * Called by the plugin on join so it can surface pending invites
 * with a clickable "Accept" / "Decline" hint in chat, and from
 * /clan accept (no args) so the plugin can render the user's
 * pending picks.
 *
 * Only returns rows where status='pending' AND expires_at>now() —
 * the partial index `clan_invitations_invitee_pending_idx` keeps
 * the lookup cheap even on a populated table.
 */

import { NextResponse } from 'next/server';
import { and, eq, gt, desc } from 'drizzle-orm';
import { dbEnabled, getDb, schema } from '@/lib/server/db';
import { requirePluginAuth } from '@/lib/server/plugin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export async function GET(
  req: Request,
  ctx: { params: Promise<{ uuid: string }> },
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

  const { uuid } = await ctx.params;
  if (!UUID_RE.test(uuid)) {
    return NextResponse.json({ error: 'invalid uuid' }, { status: 400 });
  }

  const db = getDb();
  const now = new Date();
  const rows = await db
    .select({
      id: schema.clanInvitations.id,
      clanId: schema.clanInvitations.clanId,
      clanTag: schema.clans.tag,
      clanName: schema.clans.name,
      clanColorHex: schema.clans.colorHex,
      inviteeUuid: schema.clanInvitations.inviteeUuid,
      inviteeName: schema.clanInvitations.inviteeName,
      inviterUuid: schema.clanInvitations.inviterUuid,
      status: schema.clanInvitations.status,
      expiresAt: schema.clanInvitations.expiresAt,
      createdAt: schema.clanInvitations.createdAt,
    })
    .from(schema.clanInvitations)
    .innerJoin(schema.clans, eq(schema.clanInvitations.clanId, schema.clans.id))
    .where(
      and(
        eq(schema.clanInvitations.inviteeUuid, uuid),
        eq(schema.clanInvitations.status, 'pending'),
        gt(schema.clanInvitations.expiresAt, now),
        eq(schema.clans.serverId, auth.id),
      ),
    )
    .orderBy(desc(schema.clanInvitations.createdAt));

  return NextResponse.json({
    invitations: rows.map((r) => ({
      id: r.id,
      clanId: r.clanId,
      clanTag: r.clanTag,
      clanName: r.clanName,
      clanColorHex: r.clanColorHex,
      inviteeUuid: r.inviteeUuid,
      inviteeName: r.inviteeName,
      inviterUuid: r.inviterUuid,
      status: r.status,
      expiresAt: r.expiresAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
    })),
  });
}
