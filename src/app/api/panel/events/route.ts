/**
 * Admin event history — list past + active event runs for a server,
 * newest first, with winner tag + participant/kill counts joined in.
 *
 * Query: ?serverId= (defaults to most-recent server), ?limit= (cap
 * 200, default 50), ?type= (airdrop|koth filter).
 *
 * Powers the history table on /dashboard/events. Counts are computed
 * with correlated sub-selects so one round-trip returns render-ready
 * rows — the table sizes stay small (one row per run).
 */

import { NextResponse } from 'next/server';
import { and, desc, eq, sql } from 'drizzle-orm';
import { requireAuth } from '@/lib/server/auth';
import { dbEnabled, getDb, schema } from '@/lib/server/db';
import { resolveServerId } from '@/lib/server/resolve-server';
import { EVENT_TYPES, type EventTypeName } from '@/lib/server/event-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;


export async function GET(req: Request) {
  const user = requireAuth(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!dbEnabled()) return NextResponse.json({ events: [] });

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
  if (!serverId) return NextResponse.json({ events: [], servers: [] });

  const db = getDb();
  const conds = [eq(schema.events.serverId, serverId)];
  if (typeFilter) conds.push(eq(schema.events.type, typeFilter));

  // Correlated counts kept as scalar sub-selects so each run returns
  // one ready-to-render row. Winner tag via left join (null when the
  // run was cancelled / had no winner).
  const rows = await db
    .select({
      id: schema.events.id,
      type: schema.events.type,
      status: schema.events.status,
      startedAt: schema.events.startedAt,
      endedAt: schema.events.endedAt,
      zoneCenterX: schema.events.zoneCenterX,
      zoneCenterZ: schema.events.zoneCenterZ,
      zoneRadius: schema.events.zoneRadius,
      winnerTag: schema.clans.tag,
      participantCount: sql<number>`(
        select count(*)::int from ${schema.eventParticipants}
        where ${schema.eventParticipants.eventId} = ${schema.events.id}
      )`,
      killCount: sql<number>`(
        select count(*)::int from ${schema.eventKills}
        where ${schema.eventKills.eventId} = ${schema.events.id}
      )`,
    })
    .from(schema.events)
    .leftJoin(schema.clans, eq(schema.clans.id, schema.events.winnerClanId))
    .where(and(...conds))
    .orderBy(desc(schema.events.startedAt))
    .limit(limit);

  return NextResponse.json({
    serverId,
    events: rows.map((r) => ({
      id: r.id,
      type: r.type,
      status: r.status,
      startedAt: r.startedAt.toISOString(),
      endedAt: r.endedAt ? r.endedAt.toISOString() : null,
      zone: { x: r.zoneCenterX, z: r.zoneCenterZ, radius: r.zoneRadius },
      winnerTag: r.winnerTag ?? null,
      participantCount: r.participantCount,
      killCount: r.killCount,
    })),
  });
}
