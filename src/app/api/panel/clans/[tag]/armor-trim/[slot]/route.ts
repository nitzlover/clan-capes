/**
 * Admin upsert/delete for a single (clan, slot) armour trim.
 *
 *   PUT    { material, pattern }   upsert
 *   DELETE                        clear that slot
 *
 * Both require admin JWT. Validation is strict: material + pattern
 * must be members of the curated allowlists so an operator can't
 * scribble an arbitrary registry key into the DB and crash the
 * plugin's Registry.get at apply time.
 */

import { NextResponse } from 'next/server';

import { requireAuth } from '@/lib/server/auth';
import {
  deleteArmorTrim,
  isArmorSlot,
  isTrimMaterial,
  isTrimPattern,
  upsertArmorTrim,
  type ArmorSlot,
  type TrimMaterial,
  type TrimPattern,
} from '@/lib/server/armor-trim-repo';
import { getClanByTag } from '@/lib/server/clan-repo';
import { normaliseTag } from '@/lib/server/clan-validators';
import { dbEnabled, getDb, schema } from '@/lib/server/db';
import { resolveServerId } from '@/lib/server/resolve-server';
import { getRequestId } from '@/lib/server/request-id';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function resolveScope(
  req: Request,
  rawTag: string,
  rawSlot: string,
): Promise<
  | { kind: 'err'; resp: NextResponse }
  | { kind: 'ok'; serverId: number; clanId: number; clanTag: string; slot: ArmorSlot }
> {
  if (!dbEnabled()) {
    return { kind: 'err', resp: NextResponse.json({ error: 'db disabled' }, { status: 503 }) };
  }
  let tag: string;
  try {
    tag = normaliseTag(rawTag);
  } catch (e) {
    return {
      kind: 'err',
      resp: NextResponse.json(
        { error: e instanceof Error ? e.message : 'invalid tag' },
        { status: 400 },
      ),
    };
  }
  if (!isArmorSlot(rawSlot)) {
    return {
      kind: 'err',
      resp: NextResponse.json(
        { error: 'slot must be one of head/chest/legs/feet' },
        { status: 400 },
      ),
    };
  }
  const serverId = await resolveServerId(req);
  if (!serverId) {
    return {
      kind: 'err',
      resp: NextResponse.json({ error: 'no servers registered' }, { status: 409 }),
    };
  }
  const clan = await getClanByTag(serverId, tag);
  if (!clan) {
    return {
      kind: 'err',
      resp: NextResponse.json({ error: 'clan not found' }, { status: 404 }),
    };
  }
  return { kind: 'ok', serverId, clanId: clan.id, clanTag: tag, slot: rawSlot as ArmorSlot };
}

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ tag: string; slot: string }> },
) {
  const user = requireAuth(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { tag, slot } = await ctx.params;
  const scope = await resolveScope(req, tag, slot);
  if (scope.kind === 'err') return scope.resp;

  let body: { material?: string; pattern?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  if (!body.material || !isTrimMaterial(body.material)) {
    return NextResponse.json({ error: 'invalid material' }, { status: 400 });
  }
  if (!body.pattern || !isTrimPattern(body.pattern)) {
    return NextResponse.json({ error: 'invalid pattern' }, { status: 400 });
  }

  const rid = getRequestId(req);
  const record = await upsertArmorTrim({
    clanId: scope.clanId,
    slot: scope.slot,
    material: body.material as TrimMaterial,
    pattern: body.pattern as TrimPattern,
    updatedBy: `admin:${user.sub}`,
  });

  const db = getDb();
  await db.insert(schema.audit).values({
    serverId: scope.serverId,
    actor: `admin:${user.sub}`,
    action: 'ARMOR_TRIM_SET',
    target: scope.clanTag,
    payload: {
      slot: scope.slot,
      material: record.material,
      pattern: record.pattern,
      _rid: rid,
    },
  });

  return NextResponse.json(
    { ok: true, trim: record, _rid: rid },
    { headers: { 'x-request-id': rid } },
  );
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ tag: string; slot: string }> },
) {
  const user = requireAuth(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { tag, slot } = await ctx.params;
  const scope = await resolveScope(req, tag, slot);
  if (scope.kind === 'err') return scope.resp;

  await deleteArmorTrim(scope.clanId, scope.slot);
  const db = getDb();
  const rid = getRequestId(req);
  await db.insert(schema.audit).values({
    serverId: scope.serverId,
    actor: `admin:${user.sub}`,
    action: 'ARMOR_TRIM_CLEAR',
    target: scope.clanTag,
    payload: { slot: scope.slot, _rid: rid },
  });
  return NextResponse.json(
    { ok: true, _rid: rid },
    { headers: { 'x-request-id': rid } },
  );
}
