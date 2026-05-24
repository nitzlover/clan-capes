/**
 * Admin-side endpoint: list registered servers.
 *
 * Used by `/dashboard/servers` to render the server table. Only
 * surfaces non-sensitive metadata — no api_key, not even the hash —
 * since this list is shown in the admin UI and we don't want a
 * shoulder-surf to expose anything reusable.
 */

import { NextResponse } from 'next/server';
import { desc } from 'drizzle-orm';
import { requireAuth } from '@/lib/server/auth';
import { dbEnabled, getDb, schema } from '@/lib/server/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const user = requireAuth(req);
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!dbEnabled()) {
    return NextResponse.json({ servers: [] });
  }

  const db = getDb();
  const rows = await db
    .select({
      id: schema.servers.id,
      name: schema.servers.name,
      createdAt: schema.servers.createdAt,
      lastSeenAt: schema.servers.lastSeenAt,
    })
    .from(schema.servers)
    .orderBy(desc(schema.servers.createdAt));

  return NextResponse.json({
    servers: rows.map((r) => ({
      id: r.id,
      name: r.name,
      createdAt: r.createdAt.toISOString(),
      lastSeenAt: r.lastSeenAt ? r.lastSeenAt.toISOString() : null,
    })),
  });
}
