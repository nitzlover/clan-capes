/**
 * Plugin-facing event start. The plugin POSTs when an event's PREP
 * stage begins; the panel inserts an `events` row and returns its id
 * for the matching /end call.
 *
 * Body: { type, zoneCenterX, zoneCenterZ, zoneRadius, configSnapshot? }
 * Auth: plugin Bearer.
 */

import { NextResponse } from 'next/server';
import { dbEnabled, getDb, schema } from '@/lib/server/db';
import { requirePluginAuth } from '@/lib/server/plugin-auth';
import { EVENT_TYPES, type EventTypeName } from '@/lib/server/event-config';

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

  let body: {
    type?: string;
    zoneCenterX?: number;
    zoneCenterZ?: number;
    zoneRadius?: number;
    configSnapshot?: Record<string, unknown>;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  if (!body.type || !EVENT_TYPES.includes(body.type as EventTypeName)) {
    return NextResponse.json({ error: 'invalid type' }, { status: 400 });
  }
  const intOr = (v: unknown, d: number) =>
    typeof v === 'number' && Number.isInteger(v) ? v : d;

  const db = getDb();
  const [row] = await db
    .insert(schema.events)
    .values({
      serverId: ctx.id,
      type: body.type as EventTypeName,
      status: 'prep',
      zoneCenterX: intOr(body.zoneCenterX, 0),
      zoneCenterZ: intOr(body.zoneCenterZ, 0),
      zoneRadius: intOr(body.zoneRadius, 0),
      configSnapshot: body.configSnapshot ?? {},
    })
    .returning({ id: schema.events.id });

  await db.insert(schema.audit).values({
    serverId: ctx.id,
    actor: `plugin:${ctx.name}`,
    action: 'EVENT_START',
    target: body.type,
    payload: {
      eventId: row.id,
      zone: { x: body.zoneCenterX, z: body.zoneCenterZ, r: body.zoneRadius },
    },
  });

  return NextResponse.json({ ok: true, id: row.id }, { status: 201 });
}
