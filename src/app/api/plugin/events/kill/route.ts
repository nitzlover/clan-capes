/**
 * Plugin-facing in-event kill log. POSTed for each kill that happens
 * inside an active event's zone. Snapshots both players' clans at
 * insert time so a later rename/disband doesn't rewrite the event's
 * kill feed.
 *
 * Body: { eventId, killerUuid, victimUuid }
 * Auth: plugin Bearer.
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { getClanForPlayer } from '@/lib/server/clan-repo';
import { dbEnabled, getDb, schema } from '@/lib/server/db';
import { requirePluginAuth } from '@/lib/server/plugin-auth';
import { tryNormaliseUuid } from '@/lib/server/uuid';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

  let body: { eventId?: number; killerUuid?: string; victimUuid?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  if (!Number.isInteger(body.eventId)) {
    return NextResponse.json({ error: 'invalid eventId' }, { status: 400 });
  }
  const killerUuid = body.killerUuid ? tryNormaliseUuid(body.killerUuid) : null;
  const victimUuid = body.victimUuid ? tryNormaliseUuid(body.victimUuid) : null;
  if (!killerUuid || !victimUuid) {
    return NextResponse.json({ error: 'invalid killer/victim uuid' }, { status: 400 });
  }
  const eventId = body.eventId as number;

  const db = getDb();
  // Scope check — the event must be this server's.
  const [ev] = await db
    .select({ id: schema.events.id })
    .from(schema.events)
    .where(and(eq(schema.events.id, eventId), eq(schema.events.serverId, ctx.id)))
    .limit(1);
  if (!ev) {
    return NextResponse.json({ error: 'event not found' }, { status: 404 });
  }

  const [killerClan, victimClan] = await Promise.all([
    getClanForPlayer(ctx.id, killerUuid),
    getClanForPlayer(ctx.id, victimUuid),
  ]);

  await db.insert(schema.eventKills).values({
    eventId,
    killerUuid,
    victimUuid,
    killerClanId: killerClan?.id ?? null,
    victimClanId: victimClan?.id ?? null,
  });

  return NextResponse.json({ ok: true });
}
