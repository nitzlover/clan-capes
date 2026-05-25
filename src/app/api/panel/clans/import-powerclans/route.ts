/**
 * Admin-triggered: pull every clan PowerClans currently knows about
 * (via the plugin's existing /api/powerclans/clans REST surface),
 * mint matching rows in our `clans` + `clan_members` tables.
 *
 * Idempotent: any tag that already exists active on the chosen server
 * is skipped, so the button can be safely re-pressed.
 *
 * Each PowerClans row gives us `{ id, tag, leader, level }`. We seed
 * the leader as the single founding member with role=leader and a
 * placeholder display name ("Leader") — the operator can rename later
 * via the in-game `/clan` flow, or future imports can pull the proper
 * names once the plugin exposes them.
 */

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server/auth';
import { dbEnabled, getDb, schema } from '@/lib/server/db';
import { getClanByTag } from '@/lib/server/clan-repo';
import {
  allocateUnusedColor,
  isValidTag,
  normaliseTag,
} from '@/lib/server/clan-validators';
import * as mc from '@/lib/server/minecraft';
import { resolveMojangName } from '@/lib/server/mojang';
import { isUniqueViolation } from '@/lib/server/pg-errors';
import { getRequestId } from '@/lib/server/request-id';
import { getServerSettings } from '@/lib/server/settings-repo';
import { desc } from 'drizzle-orm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export async function POST(req: Request) {
  const user = requireAuth(req);
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!dbEnabled()) {
    return NextResponse.json({ error: 'db disabled' }, { status: 503 });
  }

  // Server ID either comes from a JSON body or, if omitted, defaults
  // to the first registered server (covers the common single-server
  // case without an extra round-trip).
  let body: { serverId?: number } = {};
  try {
    body = await req.json();
  } catch {
    // Body optional — ignore.
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
        { error: 'no servers registered yet — register one in /dashboard/servers first' },
        { status: 409 },
      );
    }
    serverId = first.id;
  }

  let powerClans: Awaited<ReturnType<typeof mc.fetchPowerClans>>;
  try {
    powerClans = await mc.fetchPowerClans();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'plugin unreachable' },
      { status: 502 },
    );
  }

  let imported = 0;
  let skipped = 0;
  const report: Array<{ tag: string; status: string; reason?: string }> = [];

  for (const pc of powerClans) {
    let tag: string;
    try {
      tag = normaliseTag(pc.tag);
    } catch {
      report.push({ tag: pc.tag, status: 'skipped', reason: 'invalid tag shape' });
      skipped++;
      continue;
    }
    if (!isValidTag(tag)) {
      report.push({ tag, status: 'skipped', reason: 'invalid tag shape' });
      skipped++;
      continue;
    }
    if (!pc.leader || !UUID_RE.test(pc.leader)) {
      report.push({ tag, status: 'skipped', reason: 'leader is not a UUID' });
      skipped++;
      continue;
    }

    const existing = await getClanByTag(serverId, tag);
    if (existing) {
      report.push({ tag, status: 'skipped', reason: 'already exists' });
      skipped++;
      continue;
    }

    const settings = await getServerSettings(serverId);
    const colorHex = await allocateUnusedColor(serverId, settings.palette);
    if (!colorHex) {
      report.push({ tag, status: 'skipped', reason: 'palette exhausted' });
      skipped++;
      continue;
    }

    // Best-effort Mojang lookup so the imported row carries a real
    // username instead of the "Leader" placeholder. Null result =
    // Mojang doesn't know the UUID (cracked player, offline-only
    // account, transient outage) — fall back to the tag itself so
    // the row is still readable on the panel UI.
    const resolved = await resolveMojangName(pc.leader);
    const leaderName = resolved ?? `Leader of ${tag}`;

    const rid = getRequestId(req);

    // Tx-wrap each import row independently — one bad clan shouldn't
    // poison the rest of the batch.
    try {
      await db.transaction(async (tx) => {
        const [clan] = await tx
          .insert(schema.clans)
          .values({
            serverId: serverId!,
            tag,
            name: tag,
            colorHex,
            leaderUuid: pc.leader,
          })
          .returning();
        await tx.insert(schema.clanMembers).values({
          clanId: clan.id,
          serverId: serverId!,
          playerUuid: pc.leader,
          playerName: leaderName,
          role: 'leader',
        });
        await tx.insert(schema.audit).values({
          serverId,
          actor: user.sub,
          action: 'CLAN_IMPORT',
          target: tag,
          payload: {
            source: 'powerclans',
            colorHex,
            leaderUuid: pc.leader,
            _rid: rid,
          },
        });
      });
      report.push({ tag, status: 'imported' });
      imported++;
    } catch (e) {
      if (isUniqueViolation(e)) {
        report.push({
          tag,
          status: 'skipped',
          reason: 'unique violation (color or membership taken)',
        });
        skipped++;
      } else {
        report.push({
          tag,
          status: 'skipped',
          reason: e instanceof Error ? e.message : 'unknown db error',
        });
        skipped++;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    serverId,
    imported,
    skipped,
    report,
  });
}
