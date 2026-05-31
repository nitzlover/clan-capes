/**
 * Plugin-facing clan list + create.
 *
 * GET — every active clan on this server. Plugin caches the result in
 * memory and refreshes every five minutes (ClanRepository).
 *
 * POST — create a new clan. Payload:
 *   { tag, name, leaderUuid, leaderName, colorHex? }
 * If colorHex is omitted we allocate from the curated 32-slot palette;
 * if present we verify uniqueness on the server (collisions cause 409).
 * The creator is added as the first member with role=leader in the
 * same transaction so the clan row never exists without its leader.
 */

import { NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { getClanByTag, listClansForServer } from '@/lib/server/clan-repo';
import { dbEnabled, getDb, schema } from '@/lib/server/db';
import { requirePluginAuth } from '@/lib/server/plugin-auth';
import {
  allocateUnusedColor,
  isColorTaken,
  isValidColor,
  normaliseTag,
} from '@/lib/server/clan-validators';
import {
  isUniqueViolation,
  uniqueConstraintHint,
} from '@/lib/server/pg-errors';
import { getRequestId } from '@/lib/server/request-id';
import { getServerSettings } from '@/lib/server/settings-repo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export async function GET(req: Request) {
  if (!dbEnabled()) {
    return NextResponse.json({ clans: [] });
  }
  const ctx = await requirePluginAuth(req);
  if (!ctx) {
    return NextResponse.json(
      { error: 'invalid or missing plugin API key' },
      { status: 401 },
    );
  }

  const clans = await listClansForServer(ctx.id);
  return NextResponse.json({ clans });
}

export async function POST(req: Request) {
  if (!dbEnabled()) {
    return NextResponse.json({ error: 'db disabled' }, { status: 503 });
  }
  const ctx = await requirePluginAuth(req);
  if (!ctx) {
    return NextResponse.json(
      { error: 'invalid or missing plugin API key' },
      { status: 401 },
    );
  }

  let body: {
    tag?: string;
    name?: string;
    leaderUuid?: string;
    leaderName?: string;
    colorHex?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  let tag: string;
  try {
    tag = normaliseTag(body.tag ?? '');
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'invalid tag' },
      { status: 400 },
    );
  }
  const name = (body.name ?? '').trim();
  if (name.length < 1 || name.length > 32) {
    return NextResponse.json(
      { error: 'name must be 1-32 chars' },
      { status: 400 },
    );
  }
  if (!body.leaderUuid || !UUID_RE.test(body.leaderUuid)) {
    return NextResponse.json({ error: 'invalid leaderUuid' }, { status: 400 });
  }
  if (!body.leaderName || body.leaderName.length < 1) {
    return NextResponse.json({ error: 'leaderName required' }, { status: 400 });
  }
  // Narrowed locals — TS loses the body.* narrowing across the tx
  // closure boundary, so capture them in plain consts up front.
  const leaderUuid: string = body.leaderUuid;
  const leaderName: string = body.leaderName;
  if (body.colorHex && !isValidColor(body.colorHex)) {
    return NextResponse.json(
      { error: 'colorHex must look like #RRGGBB' },
      { status: 400 },
    );
  }

  const db = getDb();

  // Uniqueness checks — early reject so we don't burn a palette slot
  // on a doomed create.
  const existing = await getClanByTag(ctx.id, tag);
  if (existing) {
    return NextResponse.json(
      { error: `clan tag "${tag}" already exists on this server` },
      { status: 409 },
    );
  }
  const existingMembership = await db
    .select({ id: schema.clanMembers.id })
    .from(schema.clanMembers)
    .innerJoin(schema.clans, eq(schema.clanMembers.clanId, schema.clans.id))
    .where(
      and(
        eq(schema.clanMembers.playerUuid, body.leaderUuid),
        isNull(schema.clanMembers.leftAt),
        eq(schema.clans.serverId, ctx.id),
        isNull(schema.clans.disbandedAt),
      ),
    )
    .limit(1);
  if (existingMembership.length > 0) {
    return NextResponse.json(
      { error: 'leader is already in a clan on this server' },
      { status: 409 },
    );
  }

  let colorHex: string;
  if (body.colorHex) {
    if (await isColorTaken(ctx.id, body.colorHex)) {
      return NextResponse.json(
        { error: `color ${body.colorHex} already used by another clan` },
        { status: 409 },
      );
    }
    colorHex = body.colorHex.toUpperCase();
  } else {
    // Pull the operator-set palette so /dashboard/settings can curate
    // the colour pool without code changes.
    const settings = await getServerSettings(ctx.id);
    const allocated = await allocateUnusedColor(ctx.id, settings.palette);
    if (!allocated) {
      return NextResponse.json(
        { error: 'palette exhausted; pass colorHex explicitly' },
        { status: 503 },
      );
    }
    colorHex = allocated;
  }

  const rid = getRequestId(req);

  // Atomic: clan row + leader membership + audit live or die together.
  // A 23505 unique_violation here means our pre-checks lost a race —
  // map it to 409 with a friendly hint instead of leaking the raw
  // Postgres error.
  let dto;
  try {
    dto = await db.transaction(async (tx) => {
      const [clan] = await tx
        .insert(schema.clans)
        .values({
          serverId: ctx.id,
          tag,
          name,
          colorHex,
          leaderUuid,
        })
        .returning();

      const [member] = await tx
        .insert(schema.clanMembers)
        .values({
          clanId: clan.id,
          serverId: ctx.id,
          playerUuid: leaderUuid,
          playerName: leaderName,
          role: 'leader',
        })
        .returning();

      await tx.insert(schema.audit).values({
        serverId: ctx.id,
        actor: `plugin:${ctx.name}`,
        action: 'CLAN_CREATE',
        target: tag,
        payload: { name, colorHex, leaderUuid, _rid: rid },
      });

      // Hotfix (1.0.11 panel-side): the prior implementation called
      // getClanByTag here, which opens its own getDb() connection and
      // does not see the rows we just inserted through `tx` (Postgres
      // read-committed isolation isolates separate connections from
      // uncommitted writes). Result: the SELECT returned null, the
      // POST response shipped `clan: null`, and the plugin NPE'd in
      // doCreate's whenComplete callback even though the clan row
      // had already been persisted. Build the DTO directly from the
      // RETURNING rows — same shape as getClanByTag, no extra read.
      return {
        id: clan.id,
        tag: clan.tag,
        name: clan.name,
        colorHex: clan.colorHex,
        leaderUuid: clan.leaderUuid,
        createdAt: clan.createdAt.toISOString(),
        friendlyFire: clan.friendlyFire,
        members: [
          {
            playerUuid: member.playerUuid,
            playerName: member.playerName,
            role: member.role,
            joinedAt: member.joinedAt.toISOString(),
          },
        ],
        stats: null,
      };
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
