/**
 * Add a member to an existing clan.
 *
 * Plugin enforces "invitation accepted" / "player not already in
 * a clan" / "actor is leader-or-deputy" rules locally before calling
 * this; the panel just persists. Payload:
 *   { playerUuid, playerName, role?, actorUuid? }
 *
 * Default role is "member". Pre-creating a deputy is allowed for
 * scripted imports but the normal flow promotes from member after
 * the player has joined.
 */

import { NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { getClanByTag } from '@/lib/server/clan-repo';
import { dbEnabled, getDb, schema } from '@/lib/server/db';
import { requirePluginAuth } from '@/lib/server/plugin-auth';
import { normaliseTag } from '@/lib/server/clan-validators';
import {
  isUniqueViolation,
  uniqueConstraintHint,
} from '@/lib/server/pg-errors';
import { getRequestId } from '@/lib/server/request-id';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const VALID_ROLES = new Set(['leader', 'deputy', 'member']);

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
    playerUuid?: string;
    playerName?: string;
    role?: string;
    actorUuid?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  if (!body.playerUuid || !UUID_RE.test(body.playerUuid)) {
    return NextResponse.json({ error: 'invalid playerUuid' }, { status: 400 });
  }
  if (!body.playerName || body.playerName.length < 1 || body.playerName.length > 32) {
    return NextResponse.json(
      { error: 'playerName must be 1-32 chars' },
      { status: 400 },
    );
  }
  const role = (body.role ?? 'member').toLowerCase();
  if (!VALID_ROLES.has(role)) {
    return NextResponse.json(
      { error: `role must be one of ${[...VALID_ROLES].join(', ')}` },
      { status: 400 },
    );
  }

  const db = getDb();
  const clan = await getClanByTag(auth.id, tag);
  if (!clan) {
    return NextResponse.json({ error: 'clan not found' }, { status: 404 });
  }

  // Single-clan-per-player rule. Reject across the whole server, not
  // just this clan — moving between clans requires explicit leave or
  // kick first.
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
      { error: 'player is already in a clan on this server' },
      { status: 409 },
    );
  }

  const rid = getRequestId(req);
  // Hoist narrowed locals — TS loses the `if (!body.playerUuid)`
  // narrowing across the tx callback.
  const playerUuid: string = body.playerUuid;
  const playerName: string = body.playerName;

  // Wrap insert + audit in tx so the partial-unique index can't admit
  // the member row while the audit insert later fails for an unrelated
  // reason and leaves the row visible. The 23505 catch maps the race
  // outcome to a clean 409.
  let dto;
  try {
    dto = await db.transaction(async (tx) => {
      await tx.insert(schema.clanMembers).values({
        clanId: clan.id,
        serverId: auth.id,
        playerUuid,
        playerName,
        role: role as 'leader' | 'deputy' | 'member',
      });

      await tx.insert(schema.audit).values({
        serverId: auth.id,
        actor: body.actorUuid
          ? `plugin:${auth.name}:${body.actorUuid}`
          : `plugin:${auth.name}`,
        action: 'CLAN_MEMBER_ADD',
        target: tag,
        payload: {
          playerUuid,
          playerName,
          role,
          _rid: rid,
        },
      });

      return await getClanByTag(auth.id, tag);
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

  return NextResponse.json(
    { ok: true, clan: dto, _rid: rid },
    { status: 201, headers: { 'x-request-id': rid } },
  );
}
