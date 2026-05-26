/**
 * Plugin-facing kill ingest.
 *
 * Plugin POSTs every PvP kill here. Body:
 *   { killerUuid, victimUuid, occurredAt?: ISO }
 *
 * Auth: plugin Bearer. The endpoint resolves both players' current
 * clan via the same logic the dashboard uses (snapshot at insert
 * time, kept as a column on `kill_events`) so renames / disbands
 * don't rewrite history.
 *
 * Returns the resolved season key so the plugin can echo it in
 * /papi parse output ("season 2026-Q2").
 */

import { NextResponse } from 'next/server';
import { getClanForPlayer } from '@/lib/server/clan-repo';
import { dbEnabled } from '@/lib/server/db';
import { requirePluginAuth } from '@/lib/server/plugin-auth';
import { recordKill } from '@/lib/server/stats-repo';
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

  let body: { killerUuid?: string; victimUuid?: string; occurredAt?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const killerUuid = body.killerUuid ? tryNormaliseUuid(body.killerUuid) : null;
  const victimUuid = body.victimUuid ? tryNormaliseUuid(body.victimUuid) : null;
  if (!killerUuid) {
    return NextResponse.json({ error: 'invalid killerUuid' }, { status: 400 });
  }
  if (!victimUuid) {
    return NextResponse.json({ error: 'invalid victimUuid' }, { status: 400 });
  }
  const occurredAt = body.occurredAt ? new Date(body.occurredAt) : new Date();
  if (Number.isNaN(occurredAt.getTime())) {
    return NextResponse.json({ error: 'invalid occurredAt' }, { status: 400 });
  }

  // Resolve clans at ingest time (snapshot). UUIDs already normalised
  // above; getClanForPlayer compares against the same canonical form
  // the DB stores so a case-folded inbound payload never silently
  // misses the membership row.
  const [killerClan, victimClan] = await Promise.all([
    getClanForPlayer(ctx.id, killerUuid),
    getClanForPlayer(ctx.id, victimUuid),
  ]);

  const result = await recordKill({
    serverId: ctx.id,
    killerUuid,
    victimUuid,
    killerClanId: killerClan?.id ?? null,
    victimClanId: victimClan?.id ?? null,
    occurredAt,
  });

  return NextResponse.json({
    ok: true,
    skipped: result.skipped,
    seasonKey: result.seasonKey,
    killerClan: killerClan?.tag ?? null,
    victimClan: victimClan?.tag ?? null,
  });
}
