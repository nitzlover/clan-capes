/**
 * Admin: add a member to an existing clan directly via the panel.
 *
 * Used by the /dashboard/clans expanded panel "Add member" form so
 * operators can roster a player without bouncing through the in-game
 * /clan invite + accept flow (handy after a panel-side data import,
 * a Mojang outage, or when on-boarding a player who hasn't logged in
 * yet but should appear in the roster).
 *
 * Body: { playerUuid, playerName, role? }
 *   - role defaults to 'member'; deputy / leader allowed for scripted
 *     setup but leader is non-idempotent (a clan already has a leader
 *     row) — the DB partial-unique index will reject the duplicate
 *     and we map the error to a 409.
 *
 * The single-clan-per-player rule is enforced both at the application
 * layer (pre-flight check) and at the DB layer (partial unique index
 * from migration 0002), so a TOCTOU race surfaces as 409 instead of
 * a 500.
 */

import { NextResponse } from 'next/server';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { requireAuth } from '@/lib/server/auth';
import { getClanByTag } from '@/lib/server/clan-repo';
import { normaliseTag } from '@/lib/server/clan-validators';
import { dbEnabled, getDb, schema } from '@/lib/server/db';
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

  let body: { playerUuid?: string; playerName?: string; role?: string };
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

  const serverId = await resolveServerId(req);
  if (!serverId) {
    return NextResponse.json({ error: 'no servers registered' }, { status: 409 });
  }
  const clan = await getClanByTag(serverId, tag);
  if (!clan) {
    return NextResponse.json({ error: 'clan not found' }, { status: 404 });
  }

  // Pre-flight single-clan-per-player check. The DB partial unique
  // index is the source of truth; this lookup is just to return a
  // friendlier message before we waste a transaction.
  const db = getDb();
  const otherMembership = await db
    .select({ id: schema.clanMembers.id })
    .from(schema.clanMembers)
    .innerJoin(schema.clans, eq(schema.clanMembers.clanId, schema.clans.id))
    .where(
      and(
        eq(schema.clanMembers.playerUuid, body.playerUuid),
        isNull(schema.clanMembers.leftAt),
        eq(schema.clans.serverId, serverId),
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
  const playerUuid = body.playerUuid;
  const playerName = body.playerName;

  try {
    await db.transaction(async (tx) => {
      await tx.insert(schema.clanMembers).values({
        clanId: clan.id,
        serverId,
        playerUuid,
        playerName,
        role: role as 'leader' | 'deputy' | 'member',
      });
      await tx.insert(schema.audit).values({
        serverId,
        actor: `admin:${user.sub}`,
        action: 'CLAN_MEMBER_ADD',
        target: tag,
        payload: { playerUuid, playerName, role, _rid: rid },
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

  const dto = await getClanByTag(serverId, tag);
  return NextResponse.json(
    { ok: true, clan: dto, _rid: rid },
    { status: 201, headers: { 'x-request-id': rid } },
  );
}
