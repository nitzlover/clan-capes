/**
 * Admin-triggered Mojang re-resolve for every clan member row whose
 * stored display name looks like a placeholder (anything starting
 * with "Leader", "Member", or the literal "Leader of <TAG>" form
 * the PowerClans import seeds with when Mojang was unreachable at
 * import time).
 *
 * Idempotent — re-running just refreshes names for rows that still
 * match a placeholder pattern. Mojang lookups are cached upstream
 * for ~30 s on misses; we don't add our own cache because the
 * volume is tiny (one button-press per onboarding).
 */

import { NextResponse } from 'next/server';
import { desc, eq, isNull } from 'drizzle-orm';
import { requireAuth } from '@/lib/server/auth';
import { dbEnabled, getDb, schema } from '@/lib/server/db';
import { resolveMojangName } from '@/lib/server/mojang';
import { getRequestId } from '@/lib/server/request-id';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const user = requireAuth(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!dbEnabled()) {
    return NextResponse.json({ error: 'db disabled' }, { status: 503 });
  }

  let body: { serverId?: number } = {};
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
      return NextResponse.json(
        { error: 'no servers registered' },
        { status: 409 },
      );
    }
    serverId = first.id;
  }

  // Join clan_members → clans so we can scope the rewrite to a single
  // server in case the panel hosts more than one.
  const rows = await db
    .select({
      memberId: schema.clanMembers.id,
      clanId: schema.clanMembers.clanId,
      playerUuid: schema.clanMembers.playerUuid,
      playerName: schema.clanMembers.playerName,
    })
    .from(schema.clanMembers)
    .innerJoin(schema.clans, eq(schema.clanMembers.clanId, schema.clans.id))
    .where(eq(schema.clans.serverId, serverId));

  let refreshed = 0;
  let skipped = 0;
  const report: Array<{ uuid: string; old: string; new?: string; reason?: string }> = [];

  // We only touch rows that look like placeholders to avoid clobbering
  // names the operator already cleaned up manually through the UI.
  const PLACEHOLDER_RE = /^(Leader|Member|Leader of [A-Z0-9]{2,6})$/;

  for (const r of rows) {
    if (!PLACEHOLDER_RE.test(r.playerName)) {
      skipped++;
      continue;
    }
    const fresh = await resolveMojangName(r.playerUuid);
    if (!fresh) {
      report.push({ uuid: r.playerUuid, old: r.playerName, reason: 'mojang miss' });
      skipped++;
      continue;
    }
    if (fresh === r.playerName) {
      skipped++;
      continue;
    }
    await db
      .update(schema.clanMembers)
      .set({ playerName: fresh })
      .where(eq(schema.clanMembers.id, r.memberId));
    report.push({ uuid: r.playerUuid, old: r.playerName, new: fresh });
    refreshed++;
  }

  const rid = getRequestId(req);
  await db.insert(schema.audit).values({
    serverId,
    actor: `admin:${user.sub}`,
    action: 'MEMBER_NAMES_BACKFILL',
    target: null,
    payload: { refreshed, skipped, _rid: rid },
  });

  return NextResponse.json(
    { ok: true, serverId, refreshed, skipped, report, _rid: rid },
    { headers: { 'x-request-id': rid } },
  );
}
