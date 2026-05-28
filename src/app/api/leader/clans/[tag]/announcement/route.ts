/**
 * Leader-panel announcement CRUD. Scoped via `requireLeaderScope` so
 * a leader (or deputy) can only manage their own clan's announcement.
 * Mirror of the admin route but with leader scope + leader-prefixed
 * audit actor.
 */

import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/lib/server/db';
import { requireLeaderScope } from '@/lib/server/leader-scope';
import { getRequestId } from '@/lib/server/request-id';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BODY_MIN = 1;
const BODY_MAX = 500;

export async function GET(
  req: Request,
  ctx: { params: Promise<{ tag: string }> },
) {
  const { tag } = await ctx.params;
  const scope = await requireLeaderScope(req, tag);
  if (scope instanceof NextResponse) return scope;

  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.clanAnnouncements)
    .where(eq(schema.clanAnnouncements.clanId, scope.clan.id))
    .limit(1);
  if (!row) {
    return NextResponse.json({ error: 'no announcement' }, { status: 404 });
  }
  return NextResponse.json({
    body: row.body,
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: row.updatedBy,
  });
}

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ tag: string }> },
) {
  const { tag } = await ctx.params;
  const scope = await requireLeaderScope(req, tag);
  if (scope instanceof NextResponse) return scope;
  const { clan, session } = scope;

  let parsed: { body?: unknown };
  try {
    parsed = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const body = typeof parsed.body === 'string' ? parsed.body.trim() : '';
  if (body.length < BODY_MIN || body.length > BODY_MAX) {
    return NextResponse.json(
      { error: `body must be ${BODY_MIN}-${BODY_MAX} chars` },
      { status: 400 },
    );
  }

  const db = getDb();
  const rid = getRequestId(req);
  const now = new Date();
  const actor = `leader:${session.sub}`;

  await db.transaction(async (tx) => {
    await tx
      .insert(schema.clanAnnouncements)
      .values({
        clanId: clan.id,
        body,
        updatedAt: now,
        updatedBy: actor,
      })
      .onConflictDoUpdate({
        target: schema.clanAnnouncements.clanId,
        set: { body, updatedAt: now, updatedBy: actor },
      });
    await tx.insert(schema.audit).values({
      serverId: session.serverId,
      actor,
      action: 'ANNOUNCEMENT_EDIT',
      target: clan.tag,
      payload: { body, _rid: rid },
    });
  });

  return NextResponse.json(
    {
      ok: true,
      body,
      updatedAt: now.toISOString(),
      updatedBy: actor,
      _rid: rid,
    },
    { headers: { 'x-request-id': rid } },
  );
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ tag: string }> },
) {
  const { tag } = await ctx.params;
  const scope = await requireLeaderScope(req, tag);
  if (scope instanceof NextResponse) return scope;
  const { clan, session } = scope;

  const db = getDb();
  const rid = getRequestId(req);
  const actor = `leader:${session.sub}`;

  await db.transaction(async (tx) => {
    await tx
      .delete(schema.clanAnnouncements)
      .where(eq(schema.clanAnnouncements.clanId, clan.id));
    await tx.insert(schema.audit).values({
      serverId: session.serverId,
      actor,
      action: 'ANNOUNCEMENT_CLEAR',
      target: clan.tag,
      payload: { _rid: rid },
    });
  });

  return NextResponse.json(
    { ok: true, _rid: rid },
    { headers: { 'x-request-id': rid } },
  );
}
