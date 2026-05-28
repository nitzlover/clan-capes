/**
 * Plugin-facing event end. POSTed when an event resolves (winner) or
 * is cancelled. Stamps the events row, upserts per-participant
 * counters, and rolls the participants' kills into clan_stats via the
 * existing stats path is intentionally NOT done here — event stats
 * stay in the event_* tables so leaderboards can filter by event
 * type without polluting the global season counters.
 *
 * Body:
 *   { eventId, winnerClanId?, cancelled?: bool,
 *     participants: { "<uuid>": { clanId, kills, deaths, eliminated } } }
 * Auth: plugin Bearer.
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { dbEnabled, getDb, schema } from '@/lib/server/db';
import { requirePluginAuth } from '@/lib/server/plugin-auth';
import { tryNormaliseUuid } from '@/lib/server/uuid';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ParticipantIn = {
  clanId?: number;
  kills?: number;
  deaths?: number;
  eliminated?: boolean;
};

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
    eventId?: number;
    winnerClanId?: number | null;
    cancelled?: boolean;
    participants?: Record<string, ParticipantIn>;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  if (!Number.isInteger(body.eventId)) {
    return NextResponse.json({ error: 'invalid eventId' }, { status: 400 });
  }
  const eventId = body.eventId as number;

  const db = getDb();

  // Confirm the event belongs to this server before mutating it —
  // a leaked key from another server can't close someone else's run.
  const [ev] = await db
    .select({ id: schema.events.id })
    .from(schema.events)
    .where(and(eq(schema.events.id, eventId), eq(schema.events.serverId, ctx.id)))
    .limit(1);
  if (!ev) {
    return NextResponse.json({ error: 'event not found' }, { status: 404 });
  }

  const now = new Date();
  const participants = body.participants ?? {};

  await db.transaction(async (tx) => {
    await tx
      .update(schema.events)
      .set({
        status: body.cancelled ? 'cancelled' : 'ended',
        endedAt: now,
        winnerClanId:
          typeof body.winnerClanId === 'number' ? body.winnerClanId : null,
      })
      .where(eq(schema.events.id, eventId));

    for (const [rawUuid, p] of Object.entries(participants)) {
      const uuid = tryNormaliseUuid(rawUuid);
      if (!uuid || typeof p.clanId !== 'number') continue;
      await tx
        .insert(schema.eventParticipants)
        .values({
          eventId,
          clanId: p.clanId,
          playerUuid: uuid,
          kills: p.kills ?? 0,
          deaths: p.deaths ?? 0,
          eliminatedAt: p.eliminated ? now : null,
        })
        .onConflictDoUpdate({
          target: [
            schema.eventParticipants.eventId,
            schema.eventParticipants.playerUuid,
          ],
          set: {
            kills: p.kills ?? 0,
            deaths: p.deaths ?? 0,
            eliminatedAt: p.eliminated ? now : null,
          },
        });
    }

    await tx.insert(schema.audit).values({
      serverId: ctx.id,
      actor: `plugin:${ctx.name}`,
      action: body.cancelled ? 'EVENT_CANCEL' : 'EVENT_END',
      target: String(eventId),
      payload: {
        winnerClanId: body.winnerClanId ?? null,
        participants: Object.keys(participants).length,
      },
    });
  });

  return NextResponse.json({ ok: true });
}
