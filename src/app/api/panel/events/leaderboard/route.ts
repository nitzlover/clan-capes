/**
 * Per-clan event leaderboard.
 *
 * Aggregates the event_* tables into one row per clan: events won,
 * distinct events entered, and total kills / deaths across all event
 * participation. Server-scoped, ordered by wins desc then kills desc.
 *
 * Powers the leaderboard section on /dashboard/events. Optional
 * ?type= filter narrows to one event variant; ?limit= caps rows
 * (default 25).
 */

import { NextResponse } from 'next/server';
import { and, desc, eq, sql } from 'drizzle-orm';
import { requireAuth } from '@/lib/server/auth';
import { dbEnabled, getDb, schema } from '@/lib/server/db';
import { resolveServerId } from '@/lib/server/resolve-server';
import { EVENT_TYPES, type EventTypeName } from '@/lib/server/event-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 25;

export async function GET(req: Request) {
  const user = requireAuth(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!dbEnabled()) return NextResponse.json({ rows: [] });

  const url = new URL(req.url);
  const rawLimit = Number(url.searchParams.get('limit'));
  const limit =
    Number.isInteger(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, MAX_LIMIT)
      : DEFAULT_LIMIT;
  const typeParam = url.searchParams.get('type');
  const typeFilter =
    typeParam && EVENT_TYPES.includes(typeParam as EventTypeName)
      ? (typeParam as EventTypeName)
      : null;

  const serverId = await resolveServerId(req);
  if (!serverId) return NextResponse.json({ rows: [] });

  const db = getDb();

  // Two aggregates joined by clan:
  //   - participation totals (kills/deaths/distinct events) from
  //     event_participants ⋈ events (scoped to server [+ type]).
  //   - win counts from events.winner_clan_id.
  // Done with grouped selects + a Map merge rather than one gnarly
  // SQL so the type filter stays readable.
  const evConds = [eq(schema.events.serverId, serverId)];
  if (typeFilter) evConds.push(eq(schema.events.type, typeFilter));

  const partRows = await db
    .select({
      clanId: schema.eventParticipants.clanId,
      tag: schema.clans.tag,
      kills: sql<number>`coalesce(sum(${schema.eventParticipants.kills}), 0)::int`,
      deaths: sql<number>`coalesce(sum(${schema.eventParticipants.deaths}), 0)::int`,
      events: sql<number>`count(distinct ${schema.eventParticipants.eventId})::int`,
    })
    .from(schema.eventParticipants)
    .innerJoin(schema.events, eq(schema.events.id, schema.eventParticipants.eventId))
    .innerJoin(schema.clans, eq(schema.clans.id, schema.eventParticipants.clanId))
    .where(and(...evConds))
    .groupBy(schema.eventParticipants.clanId, schema.clans.tag);

  const winConds = [
    eq(schema.events.serverId, serverId),
    sql`${schema.events.winnerClanId} is not null`,
  ];
  if (typeFilter) winConds.push(eq(schema.events.type, typeFilter));
  const winRows = await db
    .select({
      clanId: schema.events.winnerClanId,
      wins: sql<number>`count(*)::int`,
    })
    .from(schema.events)
    .where(and(...winConds))
    .groupBy(schema.events.winnerClanId);

  const winByClan = new Map<number, number>();
  for (const w of winRows) {
    if (w.clanId != null) winByClan.set(w.clanId, w.wins);
  }

  const rows = partRows
    .map((r) => ({
      clanId: r.clanId,
      tag: r.tag,
      wins: winByClan.get(r.clanId) ?? 0,
      events: r.events,
      kills: r.kills,
      deaths: r.deaths,
      kd: r.deaths > 0 ? r.kills / r.deaths : r.kills,
    }))
    .sort((a, b) => b.wins - a.wins || b.kills - a.kills)
    .slice(0, limit);

  return NextResponse.json({ rows });
}
