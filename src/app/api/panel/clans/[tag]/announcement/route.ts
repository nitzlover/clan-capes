/**
 * Admin announcement CRUD for a clan.
 *
 *   GET    → current body + updatedAt + updatedBy, or 404 if unset
 *   PUT    → upsert the body (audited)
 *   DELETE → clear the row (audited)
 *
 * The body is plain text, 1–500 chars. The plugin polls
 * `/api/plugin/announcements` every five minutes and surfaces the
 * latest body inside `/clan info` and on the clan-panel banner.
 *
 * Admin uses the same `?serverId=` resolution as the rest of
 * /api/panel/clans/*, defaulting to the most-recently-registered
 * server so the single-server deploy "just works" without the query
 * string.
 */

import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireAuth } from '@/lib/server/auth';
import { getClanByTag } from '@/lib/server/clan-repo';
import { normaliseTag } from '@/lib/server/clan-validators';
import { dbEnabled, getDb, schema } from '@/lib/server/db';
import { resolveServerId } from '@/lib/server/resolve-server';
import { getRequestId } from '@/lib/server/request-id';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BODY_MIN = 1;
const BODY_MAX = 500;

export async function GET(
  req: Request,
  ctx: { params: Promise<{ tag: string }> },
) {
  const user = requireAuth(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!dbEnabled()) return NextResponse.json({ error: 'db disabled' }, { status: 503 });

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

  const serverId = await resolveServerId(req);
  if (!serverId) {
    return NextResponse.json({ error: 'no servers registered' }, { status: 409 });
  }
  const clan = await getClanByTag(serverId, tag);
  if (!clan) {
    return NextResponse.json({ error: 'clan not found' }, { status: 404 });
  }

  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.clanAnnouncements)
    .where(eq(schema.clanAnnouncements.clanId, clan.id))
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
  const user = requireAuth(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!dbEnabled()) return NextResponse.json({ error: 'db disabled' }, { status: 503 });

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

  const serverId = await resolveServerId(req);
  if (!serverId) {
    return NextResponse.json({ error: 'no servers registered' }, { status: 409 });
  }
  const clan = await getClanByTag(serverId, tag);
  if (!clan) {
    return NextResponse.json({ error: 'clan not found' }, { status: 404 });
  }

  const db = getDb();
  const rid = getRequestId(req);
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .insert(schema.clanAnnouncements)
      .values({
        clanId: clan.id,
        body,
        updatedAt: now,
        updatedBy: `admin:${user.sub}`,
      })
      .onConflictDoUpdate({
        target: schema.clanAnnouncements.clanId,
        set: { body, updatedAt: now, updatedBy: `admin:${user.sub}` },
      });
    await tx.insert(schema.audit).values({
      serverId,
      actor: `admin:${user.sub}`,
      action: 'ANNOUNCEMENT_EDIT',
      target: tag,
      payload: { body, _rid: rid },
    });
  });

  return NextResponse.json(
    {
      ok: true,
      body,
      updatedAt: now.toISOString(),
      updatedBy: `admin:${user.sub}`,
      _rid: rid,
    },
    { headers: { 'x-request-id': rid } },
  );
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ tag: string }> },
) {
  const user = requireAuth(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!dbEnabled()) return NextResponse.json({ error: 'db disabled' }, { status: 503 });

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

  const serverId = await resolveServerId(req);
  if (!serverId) {
    return NextResponse.json({ error: 'no servers registered' }, { status: 409 });
  }
  const clan = await getClanByTag(serverId, tag);
  if (!clan) {
    return NextResponse.json({ error: 'clan not found' }, { status: 404 });
  }

  const db = getDb();
  const rid = getRequestId(req);

  await db.transaction(async (tx) => {
    await tx
      .delete(schema.clanAnnouncements)
      .where(eq(schema.clanAnnouncements.clanId, clan.id));
    await tx.insert(schema.audit).values({
      serverId,
      actor: `admin:${user.sub}`,
      action: 'ANNOUNCEMENT_CLEAR',
      target: tag,
      payload: { _rid: rid },
    });
  });

  return NextResponse.json(
    { ok: true, _rid: rid },
    { headers: { 'x-request-id': rid } },
  );
}
