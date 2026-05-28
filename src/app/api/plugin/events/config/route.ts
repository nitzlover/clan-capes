/**
 * Plugin-facing event config snapshot.
 *
 * Returns the per-server config for every event type as a single
 * round-trip. Missing rows are surfaced as the registry default —
 * the plugin then uses them on its scheduled tick without an extra
 * setup step.
 *
 * Response:
 *   {
 *     configs: [
 *       { type: "airdrop", enabled: true,
 *         intervalMinutes: 120, durationMinutes: 35,
 *         radiusBlocks: 300, payload: {...} },
 *       { type: "koth", enabled: true,
 *         intervalMinutes: 300, durationMinutes: 30,
 *         radiusBlocks: 200, payload: {...} }
 *     ]
 *   }
 */

import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { dbEnabled, getDb, schema } from '@/lib/server/db';
import { requirePluginAuth } from '@/lib/server/plugin-auth';
import { EVENT_DEFAULTS, type EventConfigDto } from '@/lib/server/event-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!dbEnabled()) {
    return NextResponse.json({ configs: Object.values(EVENT_DEFAULTS) });
  }
  const ctx = await requirePluginAuth(req);
  if (!ctx) {
    return NextResponse.json(
      { error: 'invalid or missing plugin API key' },
      { status: 401 },
    );
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(schema.eventConfig)
    .where(eq(schema.eventConfig.serverId, ctx.id));

  // Merge over defaults so a fresh deploy without explicit rows
  // gets sensible knobs instead of an empty array. Operators can
  // override any field via /api/panel/events/config.
  const byType: Record<string, EventConfigDto> = { ...EVENT_DEFAULTS };
  for (const r of rows) {
    byType[r.type] = {
      type: r.type,
      enabled: r.enabled,
      intervalMinutes: r.intervalMinutes,
      durationMinutes: r.durationMinutes,
      radiusBlocks: r.radiusBlocks,
      payload: (r.payload ?? {}) as Record<string, unknown>,
    };
  }

  return NextResponse.json({ configs: Object.values(byType) });
}
