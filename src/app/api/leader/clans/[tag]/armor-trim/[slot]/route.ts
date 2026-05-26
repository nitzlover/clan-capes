/**
 * Leader-panel upsert/delete for a single (clan, slot) armour trim.
 * Same rules as the admin endpoint but gated through requireLeaderScope —
 * leader or deputy can edit, JWT clan must match the URL tag, role
 * must still be valid in the live ClanRepository snapshot.
 */

import { NextResponse } from 'next/server';
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
import { getDb, schema } from '@/lib/server/db';
import { requireLeaderScope } from '@/lib/server/leader-scope';
import { getRequestId } from '@/lib/server/request-id';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ tag: string; slot: string }> },
) {
  const { tag, slot } = await ctx.params;
  if (!isArmorSlot(slot)) {
    return NextResponse.json(
      { error: 'slot must be one of head/chest/legs/feet' },
      { status: 400 },
    );
  }
  const scope = await requireLeaderScope(req, tag);
  if (scope instanceof NextResponse) return scope;
  const { clan, session } = scope;

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
    clanId: clan.id,
    slot: slot as ArmorSlot,
    material: body.material as TrimMaterial,
    pattern: body.pattern as TrimPattern,
    updatedBy: `leader:${session.sub}`,
  });

  const db = getDb();
  await db.insert(schema.audit).values({
    serverId: session.serverId,
    actor: `leader:${session.sub}`,
    action: 'ARMOR_TRIM_SET',
    target: clan.tag,
    payload: {
      slot,
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
  const { tag, slot } = await ctx.params;
  if (!isArmorSlot(slot)) {
    return NextResponse.json(
      { error: 'slot must be one of head/chest/legs/feet' },
      { status: 400 },
    );
  }
  const scope = await requireLeaderScope(req, tag);
  if (scope instanceof NextResponse) return scope;
  const { clan, session } = scope;

  await deleteArmorTrim(clan.id, slot as ArmorSlot);
  const db = getDb();
  const rid = getRequestId(req);
  await db.insert(schema.audit).values({
    serverId: session.serverId,
    actor: `leader:${session.sub}`,
    action: 'ARMOR_TRIM_CLEAR',
    target: clan.tag,
    payload: { slot, _rid: rid },
  });
  return NextResponse.json(
    { ok: true, _rid: rid },
    { headers: { 'x-request-id': rid } },
  );
}
