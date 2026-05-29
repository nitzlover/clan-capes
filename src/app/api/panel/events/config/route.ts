/**
 * Admin event-config CRUD.
 *
 *   GET → list (server-scoped). Missing types come back as defaults
 *         so the editor renders the full taxonomy on first paint.
 *   PUT → upsert one (type, server). Audited as EVENT_CONFIG_SAVE.
 */

import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireAuth } from '@/lib/server/auth';
import { dbEnabled, getDb, schema } from '@/lib/server/db';
import { resolveServerId } from '@/lib/server/resolve-server';
import {
  EVENT_DEFAULTS,
  type EventConfigDto,
  type EventTypeName,
  validateEventConfig,
} from '@/lib/server/event-config';
import { getRequestId } from '@/lib/server/request-id';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const user = requireAuth(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!dbEnabled()) {
    return NextResponse.json({ configs: Object.values(EVENT_DEFAULTS) });
  }

  const serverId = await resolveServerId(req);
  if (!serverId) {
    return NextResponse.json({ error: 'no servers registered' }, { status: 409 });
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(schema.eventConfig)
    .where(eq(schema.eventConfig.serverId, serverId));

  const byType: Record<string, EventConfigDto> = { ...EVENT_DEFAULTS };
  for (const r of rows) {
    byType[r.type] = {
      type: r.type as EventTypeName,
      enabled: r.enabled,
      intervalMinutes: r.intervalMinutes,
      durationMinutes: r.durationMinutes,
      radiusBlocks: r.radiusBlocks,
      payload: (r.payload ?? {}) as Record<string, unknown>,
    };
  }

  return NextResponse.json({ serverId, configs: Object.values(byType) });
}

export async function PUT(req: Request) {
  const user = requireAuth(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!dbEnabled()) return NextResponse.json({ error: 'db disabled' }, { status: 503 });

  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const valid = validateEventConfig(parsed);
  if (!valid.ok) {
    return NextResponse.json({ error: valid.error }, { status: 400 });
  }

  const serverId = await resolveServerId(req);
  if (!serverId) {
    return NextResponse.json({ error: 'no servers registered' }, { status: 409 });
  }

  const db = getDb();
  const rid = getRequestId(req);
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .insert(schema.eventConfig)
      .values({
        serverId,
        type: valid.value.type,
        enabled: valid.value.enabled,
        intervalMinutes: valid.value.intervalMinutes,
        durationMinutes: valid.value.durationMinutes,
        radiusBlocks: valid.value.radiusBlocks,
        payload: valid.value.payload,
        updatedAt: now,
        updatedBy: `admin:${user.sub}`,
      })
      .onConflictDoUpdate({
        target: [schema.eventConfig.serverId, schema.eventConfig.type],
        set: {
          enabled: valid.value.enabled,
          intervalMinutes: valid.value.intervalMinutes,
          durationMinutes: valid.value.durationMinutes,
          radiusBlocks: valid.value.radiusBlocks,
          payload: valid.value.payload,
          updatedAt: now,
          updatedBy: `admin:${user.sub}`,
        },
      });
    await tx.insert(schema.audit).values({
      serverId,
      actor: `admin:${user.sub}`,
      action: 'EVENT_CONFIG_SAVE',
      target: valid.value.type,
      payload: { ...valid.value, _rid: rid },
    });
  });

  return NextResponse.json(
    { ok: true, config: valid.value, _rid: rid },
    { headers: { 'x-request-id': rid } },
  );
}
