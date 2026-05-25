/**
 * Phase-5 stats helpers — read + ingest aggregates plus the season
 * key helper. The ingest path is intentionally collapsed into one
 * helper (`recordKill`) so both the plugin HTTP endpoint and any
 * future replay tool can guarantee the same upsert sequence.
 *
 * "Lifetime" totals live under a sentinel season key so the same
 * tables answer both the live leaderboard and the all-time record
 * without a second join.
 */

import { and, desc, eq, sql } from 'drizzle-orm';
import { getDb, schema } from './db';

/** Sentinel season key used for the all-time aggregate row. */
export const LIFETIME_SEASON = 'lifetime';

/**
 * Quarter-based default season key — `2026-Q2`, `2026-Q3`, … . The
 * panel never depends on this format; an operator-set season reset
 * can store any string, and ingestion will keep writing under that
 * string until reset again.
 */
export function defaultSeasonKey(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const q = Math.floor(now.getUTCMonth() / 3) + 1;
  return `${y}-Q${q}`;
}

/**
 * Read the live season key for this server. Falls back to the quarter
 * default + writes it back so callers always observe a non-empty
 * pointer after first use.
 */
export async function ensureSeasonKey(serverId: number): Promise<string> {
  const db = getDb();
  const [row] = await db
    .select({ key: schema.servers.currentSeasonKey })
    .from(schema.servers)
    .where(eq(schema.servers.id, serverId))
    .limit(1);
  if (row && row.key) return row.key;
  const fresh = defaultSeasonKey();
  await db
    .update(schema.servers)
    .set({ currentSeasonKey: fresh })
    .where(eq(schema.servers.id, serverId));
  return fresh;
}

/**
 * Single-call ingest. Inserts the kill_events row and upserts both
 * current-season and lifetime counters for the killer + victim
 * (player and clan). Wrapped in a transaction so partial writes
 * can't drift the rollups out of sync with the event log.
 *
 * Skips the kill entirely when killer == victim (suicide / fall) —
 * Bukkit can emit PlayerDeathEvent with the same UUID under some
 * world rules, and counting that as a kill+death pair would warp
 * K/D in obvious ways.
 */
export async function recordKill(input: {
  serverId: number;
  killerUuid: string;
  victimUuid: string;
  killerClanId: number | null;
  victimClanId: number | null;
  occurredAt?: Date;
}): Promise<{ seasonKey: string; skipped: boolean }> {
  if (input.killerUuid.toLowerCase() === input.victimUuid.toLowerCase()) {
    return { seasonKey: '', skipped: true };
  }
  const seasonKey = await ensureSeasonKey(input.serverId);
  const occurredAt = input.occurredAt ?? new Date();
  const db = getDb();

  await db.transaction(async (tx) => {
    // 1. Immutable event log.
    await tx.insert(schema.killEvents).values({
      serverId: input.serverId,
      killerUuid: input.killerUuid,
      victimUuid: input.victimUuid,
      killerClanId: input.killerClanId,
      victimClanId: input.victimClanId,
      seasonKey,
      occurredAt,
    });

    // 2. Player aggregates — bump kills on killer, deaths on victim,
    //    once per season + once for lifetime.
    for (const key of [seasonKey, LIFETIME_SEASON]) {
      await tx
        .insert(schema.playerStats)
        .values({
          serverId: input.serverId,
          playerUuid: input.killerUuid,
          seasonKey: key,
          kills: 1,
          deaths: 0,
        })
        .onConflictDoUpdate({
          target: [
            schema.playerStats.serverId,
            schema.playerStats.playerUuid,
            schema.playerStats.seasonKey,
          ],
          set: {
            kills: sql`${schema.playerStats.kills} + 1`,
            updatedAt: sql`now()`,
          },
        });
      await tx
        .insert(schema.playerStats)
        .values({
          serverId: input.serverId,
          playerUuid: input.victimUuid,
          seasonKey: key,
          kills: 0,
          deaths: 1,
        })
        .onConflictDoUpdate({
          target: [
            schema.playerStats.serverId,
            schema.playerStats.playerUuid,
            schema.playerStats.seasonKey,
          ],
          set: {
            deaths: sql`${schema.playerStats.deaths} + 1`,
            updatedAt: sql`now()`,
          },
        });
    }

    // 3. Clan aggregates — only when the kill involved a clan on the
    //    relevant side. Unclanned-vs-unclanned still counts toward
    //    player K/D but contributes nothing to any clan's totals.
    for (const key of [seasonKey, LIFETIME_SEASON]) {
      if (input.killerClanId != null) {
        await tx
          .insert(schema.clanStats)
          .values({
            clanId: input.killerClanId,
            seasonKey: key,
            kills: 1,
            deaths: 0,
          })
          .onConflictDoUpdate({
            target: [schema.clanStats.clanId, schema.clanStats.seasonKey],
            set: {
              kills: sql`${schema.clanStats.kills} + 1`,
              updatedAt: sql`now()`,
            },
          });
      }
      if (input.victimClanId != null) {
        await tx
          .insert(schema.clanStats)
          .values({
            clanId: input.victimClanId,
            seasonKey: key,
            kills: 0,
            deaths: 1,
          })
          .onConflictDoUpdate({
            target: [schema.clanStats.clanId, schema.clanStats.seasonKey],
            set: {
              deaths: sql`${schema.clanStats.deaths} + 1`,
              updatedAt: sql`now()`,
            },
          });
      }
    }
  });

  return { seasonKey, skipped: false };
}

export type StatsRow = {
  kills: number;
  deaths: number;
  kd: number; // computed: kills / max(deaths, 1)
};

export async function getPlayerStats(
  serverId: number,
  playerUuid: string,
  seasonKey: string,
): Promise<StatsRow> {
  const db = getDb();
  const [row] = await db
    .select({ kills: schema.playerStats.kills, deaths: schema.playerStats.deaths })
    .from(schema.playerStats)
    .where(
      and(
        eq(schema.playerStats.serverId, serverId),
        eq(schema.playerStats.playerUuid, playerUuid),
        eq(schema.playerStats.seasonKey, seasonKey),
      ),
    )
    .limit(1);
  if (!row) return { kills: 0, deaths: 0, kd: 0 };
  return {
    kills: row.kills,
    deaths: row.deaths,
    kd: row.deaths > 0 ? row.kills / row.deaths : row.kills,
  };
}

export async function getClanStats(
  clanId: number,
  seasonKey: string,
): Promise<StatsRow> {
  const db = getDb();
  const [row] = await db
    .select({ kills: schema.clanStats.kills, deaths: schema.clanStats.deaths })
    .from(schema.clanStats)
    .where(
      and(
        eq(schema.clanStats.clanId, clanId),
        eq(schema.clanStats.seasonKey, seasonKey),
      ),
    )
    .limit(1);
  if (!row) return { kills: 0, deaths: 0, kd: 0 };
  return {
    kills: row.kills,
    deaths: row.deaths,
    kd: row.deaths > 0 ? row.kills / row.deaths : row.kills,
  };
}

export type LeaderboardClanRow = {
  clanId: number;
  tag: string;
  name: string;
  colorHex: string;
  kills: number;
  deaths: number;
  kd: number;
};

/**
 * Top-N clans by season K/D. K/D is computed at read time as
 * `kills / max(deaths, 1)` — same formula the placeholder + UI use,
 * so leaderboard ordering matches what a player sees on their own
 * row.
 */
export async function getClanLeaderboard(
  serverId: number,
  seasonKey: string,
  limit: number,
): Promise<LeaderboardClanRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      clanId: schema.clanStats.clanId,
      tag: schema.clans.tag,
      name: schema.clans.name,
      colorHex: schema.clans.colorHex,
      kills: schema.clanStats.kills,
      deaths: schema.clanStats.deaths,
    })
    .from(schema.clanStats)
    .innerJoin(schema.clans, eq(schema.clans.id, schema.clanStats.clanId))
    .where(
      and(
        eq(schema.clans.serverId, serverId),
        eq(schema.clanStats.seasonKey, seasonKey),
      ),
    )
    .orderBy(desc(schema.clanStats.kills));

  return rows
    .map((r) => ({
      ...r,
      kd: r.deaths > 0 ? r.kills / r.deaths : r.kills,
    }))
    .sort((a, b) => b.kd - a.kd || b.kills - a.kills)
    .slice(0, limit);
}

export type LeaderboardPlayerRow = {
  playerUuid: string;
  playerName: string | null;
  clanTag: string | null;
  kills: number;
  deaths: number;
  kd: number;
};

export async function getPlayerLeaderboard(
  serverId: number,
  seasonKey: string,
  limit: number,
): Promise<LeaderboardPlayerRow[]> {
  const db = getDb();
  // LEFT JOIN against clan_members + clans so unclanned players still
  // appear on the leaderboard — they just show a null tag.
  const rows = await db
    .select({
      playerUuid: schema.playerStats.playerUuid,
      playerName: schema.clanMembers.playerName,
      clanTag: schema.clans.tag,
      kills: schema.playerStats.kills,
      deaths: schema.playerStats.deaths,
    })
    .from(schema.playerStats)
    .leftJoin(
      schema.clanMembers,
      and(
        eq(schema.clanMembers.playerUuid, schema.playerStats.playerUuid),
        eq(schema.clanMembers.serverId, schema.playerStats.serverId),
      ),
    )
    .leftJoin(schema.clans, eq(schema.clans.id, schema.clanMembers.clanId))
    .where(
      and(
        eq(schema.playerStats.serverId, serverId),
        eq(schema.playerStats.seasonKey, seasonKey),
      ),
    );

  return rows
    .map((r) => ({
      ...r,
      kd: r.deaths > 0 ? r.kills / r.deaths : r.kills,
    }))
    .sort((a, b) => b.kd - a.kd || b.kills - a.kills)
    .slice(0, limit);
}
