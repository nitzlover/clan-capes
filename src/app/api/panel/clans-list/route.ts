/**
 * Admin-facing list of DB-backed clans, scoped by serverId query
 * param.
 *
 * Distinct from `/api/panel/clans` (which still scans the cape upload
 * directory for the legacy roster on the Capes page). This endpoint
 * powers the new Phase 2 `/dashboard/clans` admin surface.
 */

import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { requireAuth } from '@/lib/server/auth';
import { listClansForServer } from '@/lib/server/clan-repo';
import { dbEnabled, getDb, schema } from '@/lib/server/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const user = requireAuth(req);
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!dbEnabled()) {
    return NextResponse.json({ clans: [], servers: [] });
  }

  const url = new URL(req.url);
  const serverIdRaw = url.searchParams.get('serverId');

  const db = getDb();
  const servers = await db
    .select({ id: schema.servers.id, name: schema.servers.name })
    .from(schema.servers)
    .orderBy(desc(schema.servers.createdAt));

  // If no serverId specified, default to the first server (single-
  // server admins won't have to pick).
  let serverId: number | null = null;
  if (serverIdRaw) {
    const parsed = Number(serverIdRaw);
    if (Number.isInteger(parsed) && parsed > 0) serverId = parsed;
  } else if (servers.length > 0) {
    serverId = servers[0].id;
  }

  if (!serverId) {
    return NextResponse.json({ clans: [], servers });
  }

  const clans = await listClansForServer(serverId);
  return NextResponse.json({
    clans,
    servers,
    serverId,
  });
}
