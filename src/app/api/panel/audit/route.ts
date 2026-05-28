/**
 * Audit feed.
 *
 * Prefers the DB-backed `audit` table (Phase 0+) when available so the
 * full structured payload — actor, action, target, JSON payload —
 * is surfaced to the dashboard. Falls back to the legacy file-based
 * audit.log for pre-migration deploys.
 *
 * Query params (all optional, AND-combined):
 *   ?actor=<substring>   case-insensitive ilike on actor
 *   ?action=<exact>      exact match on action (CLAN_CREATE / BANNER_SET / …)
 *   ?target=<substring>  ilike on target (clan tag, file name, …)
 *   ?since=<ISO>         ts >= since
 *   ?until=<ISO>         ts <= until
 *   ?limit=<n>           default 50 (page size), hard cap 1000
 *   ?offset=<n>          default 0 — pagination cursor; combine with
 *                        ?limit= to walk older pages
 *
 * Response shape includes a `total` count (matching the filter set,
 * NOT the page) so the UI can render "X / Y" + a working "next is
 * disabled when offset+limit >= total" check.
 */

import { NextResponse } from 'next/server';
import { and, count, desc, eq, gte, ilike, lte, type SQL } from 'drizzle-orm';
import { requireAuth } from '@/lib/server/auth';
import { dbEnabled, getDb, schema } from '@/lib/server/db';
import { readAudit } from '@/lib/server/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_LIMIT = 1000;
// Smaller default than before — pagination UI now lets the operator
// walk older pages instead of dumping 200 rows on first paint.
const DEFAULT_LIMIT = 50;

function parseDate(raw: string | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export async function GET(req: Request) {
  const user = requireAuth(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const actor = url.searchParams.get('actor')?.trim() || null;
  const action = url.searchParams.get('action')?.trim() || null;
  const target = url.searchParams.get('target')?.trim() || null;
  const since = parseDate(url.searchParams.get('since'));
  const until = parseDate(url.searchParams.get('until'));
  const rawLimit = Number(url.searchParams.get('limit'));
  const limit =
    Number.isInteger(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, MAX_LIMIT)
      : DEFAULT_LIMIT;
  const rawOffset = Number(url.searchParams.get('offset'));
  const offset =
    Number.isInteger(rawOffset) && rawOffset >= 0 ? rawOffset : 0;

  if (dbEnabled()) {
    const db = getDb();
    const conds: SQL[] = [];
    if (actor) conds.push(ilike(schema.audit.actor, `%${actor}%`));
    if (action) conds.push(eq(schema.audit.action, action));
    if (target) conds.push(ilike(schema.audit.target, `%${target}%`));
    if (since) conds.push(gte(schema.audit.ts, since));
    if (until) conds.push(lte(schema.audit.ts, until));

    const where = conds.length > 0 ? and(...conds) : undefined;

    // Total count + page rows in parallel — `total` powers the
    // "X of Y" indicator and disables Next on the last page.
    const [totalRow, rows] = await Promise.all([
      db
        .select({ n: count() })
        .from(schema.audit)
        .where(where ?? undefined)
        .then((r) => r[0]),
      db
        .select({
          id: schema.audit.id,
          ts: schema.audit.ts,
          serverId: schema.audit.serverId,
          actor: schema.audit.actor,
          action: schema.audit.action,
          target: schema.audit.target,
          payload: schema.audit.payload,
        })
        .from(schema.audit)
        .where(where ?? undefined)
        .orderBy(desc(schema.audit.ts))
        .limit(limit)
        .offset(offset),
    ]);

    // Distinct actor / action values across the (filtered) result —
    // small lists the UI uses to populate filter dropdowns without
    // a second round-trip. Cheap because the limited rows are already
    // in memory.
    const knownActors = Array.from(new Set(rows.map((r) => r.actor))).sort();
    const knownActions = Array.from(new Set(rows.map((r) => r.action))).sort();

    return NextResponse.json({
      source: 'db',
      entries: rows.map((r) => ({
        id: String(r.id),
        timestamp: r.ts.toISOString(),
        serverId: r.serverId,
        actor: r.actor,
        action: r.action,
        target: r.target,
        payload: r.payload,
      })),
      total: totalRow.n,
      limit,
      offset,
      knownActors,
      knownActions,
    });
  }

  // Legacy file fallback. Reads the tail once + slices in-memory so
  // pagination still works without a structured store.
  const all = await readAudit(MAX_LIMIT);
  const total = all.length;
  const entries = all.slice(offset, offset + limit);
  return NextResponse.json({
    source: 'file',
    entries,
    total,
    limit,
    offset,
    knownActors: [],
    knownActions: [],
  });
}
