/**
 * Plugin-facing single clan: GET / PATCH / DELETE.
 *
 * GET — lookup by tag (case-insensitive). 404 on miss so the plugin
 * branches on status without parsing the body.
 *
 * PATCH — edit name and/or color. Payload:
 *   { name?, colorHex?, actorUuid? }
 * Both fields independently optional. Colour collisions return 409.
 *
 * DELETE — disband the clan. Sets disbandedAt on the clan row and
 * leftAt on every active member. Does NOT physically delete rows so
 * stats history stays intact.
 */

import { NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { getClanByTag } from '@/lib/server/clan-repo';
import { dbEnabled, getDb, schema } from '@/lib/server/db';
import { requirePluginAuth } from '@/lib/server/plugin-auth';
import {
  isColorTaken,
  isValidColor,
  normaliseTag,
} from '@/lib/server/clan-validators';
import {
  isUniqueViolation,
  uniqueConstraintHint,
} from '@/lib/server/pg-errors';
import { getRequestId } from '@/lib/server/request-id';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
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

  // 1.0.10: normalise via the shared validator instead of the legacy
  // `[A-Za-z0-9]{1,16}` regex this route shipped with. The sibling
  // PATCH and DELETE handlers below use `normaliseTag` (2-6 chars,
  // uppercase) — a tag that passed the loose GET regex but failed the
  // tighter siblings could be looked up but never edited or disbanded.
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

  const clan = await getClanByTag(auth.id, tag);
  if (!clan) {
    return NextResponse.json({ error: 'clan not found' }, { status: 404 });
  }
  return NextResponse.json({ clan });
}

export async function PATCH(
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

  let body: { name?: string; colorHex?: string; actorUuid?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const db = getDb();
  const existing = await getClanByTag(auth.id, tag);
  if (!existing) {
    return NextResponse.json({ error: 'clan not found' }, { status: 404 });
  }

  const updates: { name?: string; colorHex?: string } = {};
  if (body.name !== undefined) {
    const n = body.name.trim();
    if (n.length < 1 || n.length > 32) {
      return NextResponse.json(
        { error: 'name must be 1-32 chars' },
        { status: 400 },
      );
    }
    updates.name = n;
  }
  if (body.colorHex !== undefined) {
    if (!isValidColor(body.colorHex)) {
      return NextResponse.json(
        { error: 'colorHex must look like #RRGGBB' },
        { status: 400 },
      );
    }
    if (await isColorTaken(auth.id, body.colorHex, existing.id)) {
      return NextResponse.json(
        { error: `color ${body.colorHex} already used by another clan` },
        { status: 409 },
      );
    }
    updates.colorHex = body.colorHex.toUpperCase();
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: 'no editable fields in body' },
      { status: 400 },
    );
  }

  const rid = getRequestId(req);
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(schema.clans)
        .set(updates)
        .where(eq(schema.clans.id, existing.id));
      await tx.insert(schema.audit).values({
        serverId: auth.id,
        actor: body.actorUuid
          ? `plugin:${auth.name}:${body.actorUuid}`
          : `plugin:${auth.name}`,
        action: 'CLAN_EDIT',
        target: tag,
        payload: { ...updates, _rid: rid },
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

  const dto = await getClanByTag(auth.id, tag);
  return NextResponse.json(
    { ok: true, clan: dto, _rid: rid },
    { headers: { 'x-request-id': rid } },
  );
}

export async function DELETE(
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

  const db = getDb();
  const existing = await getClanByTag(auth.id, tag);
  if (!existing) {
    return NextResponse.json({ error: 'clan not found' }, { status: 404 });
  }

  // Optional actorUuid in body for audit only — disband is leader-only
  // but the plugin enforces that locally before calling us.
  let actorUuid: string | undefined;
  try {
    const body = (await req.json()) as { actorUuid?: string };
    actorUuid = body.actorUuid;
  } catch {
    // Body is optional.
  }

  const now = new Date();
  const rid = getRequestId(req);

  // Stamp disband + drain memberships + audit in one tx so a crash
  // can't leave members "active" inside a disbanded clan (which the
  // partial-unique membership index would then block from rejoining
  // anywhere else).
  await db.transaction(async (tx) => {
    await tx
      .update(schema.clans)
      .set({ disbandedAt: now })
      .where(eq(schema.clans.id, existing.id));
    await tx
      .update(schema.clanMembers)
      .set({ leftAt: now })
      .where(
        and(
          eq(schema.clanMembers.clanId, existing.id),
          isNull(schema.clanMembers.leftAt),
        ),
      );
    // 1.0.10: decline pending invites and orphan-clean the cape file.
    await tx
      .update(schema.clanInvitations)
      .set({ status: 'declined' })
      .where(
        and(
          eq(schema.clanInvitations.clanId, existing.id),
          eq(schema.clanInvitations.status, 'pending'),
        ),
      );
    await tx.insert(schema.audit).values({
      serverId: auth.id,
      actor: actorUuid ? `plugin:${auth.name}:${actorUuid}` : `plugin:${auth.name}`,
      action: 'CLAN_DISBAND',
      target: tag,
      payload: { members: existing.members.length, _rid: rid },
    });
  });

  try {
    const { fs: fsApi } = await import('node:fs/promises').then((m) => ({ fs: m }));
    const { capeFilePath } = await import('@/lib/server/storage');
    await fsApi.unlink(capeFilePath(tag)).catch(() => undefined);
  } catch {
    /* storage module unavailable in some test envs — ignore */
  }

  return NextResponse.json(
    { ok: true, _rid: rid },
    { headers: { 'x-request-id': rid } },
  );
}
