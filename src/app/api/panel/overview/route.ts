/**
 * Dashboard overview — single-shot fetch backing /dashboard's KPI
 * grid.
 *
 * Five counters in one round-trip so the index page doesn't fan out
 * to five separate routes:
 *
 *   servers       — total rows in `servers`
 *   clans         — active rows (disbandedAt IS NULL)
 *   members       — active memberships across all clans (leftAt IS NULL)
 *   killsMtd      — kill_events where occurredAt >= start-of-month
 *   capesAssigned — count of `<TAG>.png` files in UPLOAD_DIR (the
 *                   panel's authoritative cape store; reading the
 *                   filesystem is fine here because the directory is
 *                   small and the dashboard caches the result for
 *                   ~30 s in the client).
 *
 * Server-scoping: all counters honour the optional `?serverId=` query
 * param. When omitted we default to "all servers" so the operator
 * sees the global picture; the dashboard picker can narrow it down.
 *
 * Auth: admin JWT only. The shape stays light intentionally — no
 * sparkline series, no per-clan breakdown — because the TODO line
 * for Wave 4 explicitly asks for "simple <div> cards, no recharts".
 */

import fs from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { and, count, eq, gte, isNull } from 'drizzle-orm';
import { requireAuth } from '@/lib/server/auth';
import { dbEnabled, getDb, schema } from '@/lib/server/db';
import { UPLOAD_DIR } from '@/lib/server/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function startOfMonthUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

async function countCapesOnDisk(): Promise<number> {
  try {
    const entries = await fs.readdir(UPLOAD_DIR);
    return entries.filter((f) => f.toLowerCase().endsWith('.png')).length;
  } catch {
    return 0;
  }
}

export async function GET(req: Request) {
  const user = requireAuth(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (!dbEnabled()) {
    // Pre-migration deploys: capes are the only honest signal we have.
    return NextResponse.json({
      servers: 0,
      clans: 0,
      members: 0,
      killsMtd: 0,
      capesAssigned: await countCapesOnDisk(),
    });
  }

  const url = new URL(req.url);
  const serverIdRaw = url.searchParams.get('serverId');
  const serverId =
    serverIdRaw && Number.isInteger(Number(serverIdRaw)) && Number(serverIdRaw) > 0
      ? Number(serverIdRaw)
      : null;

  const db = getDb();

  // Five small COUNT queries in parallel. Drizzle's `count()` helper
  // emits `select count(*)` so each call is one row over the wire.
  const monthStart = startOfMonthUtc();

  const [serverRow] = await Promise.all([
    db.select({ n: count() }).from(schema.servers),
  ]).then((r) => r[0]);

  const clanFilters = [isNull(schema.clans.disbandedAt)];
  if (serverId) clanFilters.push(eq(schema.clans.serverId, serverId));
  const [clanRow] = await db
    .select({ n: count() })
    .from(schema.clans)
    .where(and(...clanFilters));

  const memberFilters = [isNull(schema.clanMembers.leftAt)];
  if (serverId) memberFilters.push(eq(schema.clanMembers.serverId, serverId));
  const [memberRow] = await db
    .select({ n: count() })
    .from(schema.clanMembers)
    .where(and(...memberFilters));

  const killFilters = [gte(schema.killEvents.occurredAt, monthStart)];
  if (serverId) killFilters.push(eq(schema.killEvents.serverId, serverId));
  const [killRow] = await db
    .select({ n: count() })
    .from(schema.killEvents)
    .where(and(...killFilters));

  const capesAssigned = await countCapesOnDisk();

  return NextResponse.json({
    servers: serverRow.n,
    clans: clanRow.n,
    members: memberRow.n,
    killsMtd: killRow.n,
    capesAssigned,
  });
}
