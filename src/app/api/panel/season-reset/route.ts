/**
 * Admin "bump active season" button.
 *
 * Body: { serverId?, seasonKey? }
 *
 * Behaviour:
 *   - Resolves the target server (explicit serverId or most recently
 *     registered).
 *   - Picks the new season key — explicit one if provided + non-empty;
 *     otherwise the quarter-default. We DO accept any string so an
 *     operator can pick a custom name ("post-launch", "tournament-2",
 *     etc.) — only constraint is non-empty and ≤32 chars to keep
 *     joins healthy.
 *   - Stamps `servers.current_season_key`. Past aggregates remain
 *     addressable under their old key (history is never destroyed).
 *   - Audits the reset so /dashboard/audit can answer "when did this
 *     season start" without joining stats tables.
 */

import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { requireAuth } from '@/lib/server/auth';
import { dbEnabled, getDb, schema } from '@/lib/server/db';
import { defaultSeasonKey } from '@/lib/server/stats-repo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_KEY_LEN = 32;

export async function POST(req: Request) {
  const user = requireAuth(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!dbEnabled()) {
    return NextResponse.json({ error: 'db disabled' }, { status: 503 });
  }

  let body: { serverId?: number; seasonKey?: string } = {};
  try {
    body = await req.json();
  } catch {
    // Body optional.
  }

  const db = getDb();
  let serverId = body.serverId;
  if (!serverId) {
    const [first] = await db
      .select({ id: schema.servers.id })
      .from(schema.servers)
      .orderBy(desc(schema.servers.createdAt))
      .limit(1);
    if (!first) {
      return NextResponse.json({ error: 'no servers registered' }, { status: 409 });
    }
    serverId = first.id;
  }

  let nextKey = (body.seasonKey ?? '').trim();
  if (!nextKey) nextKey = defaultSeasonKey();
  if (nextKey.length > MAX_KEY_LEN) {
    return NextResponse.json(
      { error: `season key too long (max ${MAX_KEY_LEN} chars)` },
      { status: 400 },
    );
  }
  // 'lifetime' is the sentinel for the all-time bucket; refuse to
  // overwrite live writes into the lifetime row by accident.
  if (nextKey.toLowerCase() === 'lifetime') {
    return NextResponse.json(
      { error: '"lifetime" is reserved for the all-time bucket' },
      { status: 400 },
    );
  }

  // Read the previous key for the audit trail before we stamp the
  // new one.
  const [prev] = await db
    .select({ key: schema.servers.currentSeasonKey })
    .from(schema.servers)
    .where(eq(schema.servers.id, serverId))
    .limit(1);
  if (!prev) {
    return NextResponse.json({ error: 'server not found' }, { status: 404 });
  }

  await db.transaction(async (tx) => {
    await tx
      .update(schema.servers)
      .set({ currentSeasonKey: nextKey })
      .where(eq(schema.servers.id, serverId!));
    await tx.insert(schema.audit).values({
      serverId,
      actor: `admin:${user.sub}`,
      action: 'SEASON_RESET',
      target: null,
      payload: { from: prev.key, to: nextKey },
    });
  });

  return NextResponse.json({ ok: true, serverId, from: prev.key, season: nextKey });
}
