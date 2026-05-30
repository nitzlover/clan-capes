/**
 * Mint a clan invitation.
 *
 * Plugin enforces "actor is leader or deputy of <tag>" locally and
 * POSTs here. The panel double-checks the actor's role server-side
 * via the existing membership lookup, validates the invitee isn't
 * already in a clan on this server, and refuses to mint a duplicate
 * pending invite for the same (clan, invitee) pair.
 *
 * Payload:
 *   { inviteeUuid, inviteeName, inviterUuid, ttlSeconds? }
 *
 * Returns the freshly-minted invitation DTO (id + expiresAt) so the
 * plugin can echo it into the invitee's chat with a clickable
 * "Accept" / "Decline" hint.
 */

import { NextResponse } from 'next/server';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { dbEnabled, getDb, schema } from '@/lib/server/db';
import { getClanByTag } from '@/lib/server/clan-repo';
import { requirePluginAuth } from '@/lib/server/plugin-auth';
import { normaliseTag } from '@/lib/server/clan-validators';
import { getRequestId } from '@/lib/server/request-id';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const DEFAULT_TTL_SECONDS = 24 * 60 * 60; // 24h
const MIN_TTL_SECONDS = 60; //  1 min — short enough for tests
const MAX_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days hard cap

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

  let body: {
    inviteeUuid?: string;
    inviteeName?: string;
    inviterUuid?: string;
    ttlSeconds?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  if (!body.inviteeUuid || !UUID_RE.test(body.inviteeUuid)) {
    return NextResponse.json({ error: 'invalid inviteeUuid' }, { status: 400 });
  }
  if (!body.inviterUuid || !UUID_RE.test(body.inviterUuid)) {
    return NextResponse.json({ error: 'invalid inviterUuid' }, { status: 400 });
  }
  if (
    !body.inviteeName ||
    body.inviteeName.length < 1 ||
    body.inviteeName.length > 32
  ) {
    return NextResponse.json(
      { error: 'inviteeName must be 1-32 chars' },
      { status: 400 },
    );
  }
  if (body.inviteeUuid === body.inviterUuid) {
    return NextResponse.json(
      { error: 'cannot invite yourself' },
      { status: 400 },
    );
  }

  let ttl = DEFAULT_TTL_SECONDS;
  if (typeof body.ttlSeconds === 'number' && Number.isFinite(body.ttlSeconds)) {
    if (body.ttlSeconds < MIN_TTL_SECONDS || body.ttlSeconds > MAX_TTL_SECONDS) {
      return NextResponse.json(
        {
          error: `ttlSeconds must be ${MIN_TTL_SECONDS}..${MAX_TTL_SECONDS}`,
        },
        { status: 400 },
      );
    }
    ttl = Math.floor(body.ttlSeconds);
  }

  const db = getDb();
  const clan = await getClanByTag(auth.id, tag);
  if (!clan) {
    return NextResponse.json({ error: 'clan not found' }, { status: 404 });
  }

  // Inviter must be a current leader or deputy of the target clan —
  // the plugin already gates on this but a malicious api-key-holder
  // could craft a request bypassing the in-game check. Re-verify
  // against the live members list.
  const inviter = clan.members?.find(
    (m) =>
      m.playerUuid.toLowerCase() === body.inviterUuid!.toLowerCase() &&
      (m.role === 'leader' || m.role === 'deputy'),
  );
  if (!inviter) {
    return NextResponse.json(
      { error: 'inviter is not a leader or deputy of this clan' },
      { status: 403 },
    );
  }

  // Reject if the invitee is already in any clan on this server. Joining
  // a second clan requires explicit leave or kick first.
  const otherMembership = await db
    .select({ id: schema.clanMembers.id })
    .from(schema.clanMembers)
    .innerJoin(schema.clans, eq(schema.clanMembers.clanId, schema.clans.id))
    .where(
      and(
        eq(schema.clanMembers.playerUuid, body.inviteeUuid),
        isNull(schema.clanMembers.leftAt),
        eq(schema.clans.serverId, auth.id),
        isNull(schema.clans.disbandedAt),
      ),
    )
    .limit(1);
  if (otherMembership.length > 0) {
    return NextResponse.json(
      { error: 'invitee is already in a clan on this server' },
      { status: 409 },
    );
  }

  // Refuse a duplicate pending invite for the same (clan, invitee).
  // A re-invite is fine once the prior pending row has been declined
  // or expired — the partial index `clan_invitations_clan_pending_idx`
  // (migration 0010) keeps the read cheap.
  const now = new Date();
  const dupe = await db
    .select({ id: schema.clanInvitations.id })
    .from(schema.clanInvitations)
    .where(
      and(
        eq(schema.clanInvitations.clanId, clan.id),
        eq(schema.clanInvitations.inviteeUuid, body.inviteeUuid),
        eq(schema.clanInvitations.status, 'pending'),
        gt(schema.clanInvitations.expiresAt, now),
      ),
    )
    .limit(1);
  if (dupe.length > 0) {
    return NextResponse.json(
      { error: 'invitee already has a pending invitation to this clan' },
      { status: 409 },
    );
  }

  const expiresAt = new Date(now.getTime() + ttl * 1000);
  const rid = getRequestId(req);
  // Hoist narrowed fields — TS loses the !inviteeUuid / !inviterUuid
  // narrowing across the tx callback.
  const inviteeUuid = body.inviteeUuid;
  const inviteeName = body.inviteeName;
  const inviterUuid = body.inviterUuid;

  const invite = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(schema.clanInvitations)
      .values({
        clanId: clan.id,
        inviteeUuid,
        inviteeName,
        inviterUuid,
        expiresAt,
      })
      .returning();

    await tx.insert(schema.audit).values({
      serverId: auth.id,
      actor: `plugin:${auth.name}:${inviterUuid}`,
      action: 'CLAN_INVITE_CREATE',
      target: tag,
      payload: {
        inviteId: row.id,
        inviteeUuid,
        inviteeName,
        ttlSeconds: ttl,
        _rid: rid,
      },
    });

    return row;
  });

  return NextResponse.json(
    {
      ok: true,
      invitation: {
        id: invite.id,
        clanId: clan.id,
        clanTag: clan.tag,
        clanName: clan.name,
        inviteeUuid: invite.inviteeUuid,
        inviteeName: invite.inviteeName,
        inviterUuid: invite.inviterUuid,
        status: invite.status,
        expiresAt: invite.expiresAt.toISOString(),
        createdAt: invite.createdAt.toISOString(),
      },
      _rid: rid,
    },
    { status: 201, headers: { 'x-request-id': rid } },
  );
}
