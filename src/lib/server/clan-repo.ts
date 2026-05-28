/**
 * Server-side clan query helpers.
 *
 * Wraps the Drizzle queries needed by every clan-related route — both
 * the plugin-facing endpoints under /api/plugin/clans/* and the
 * admin-facing ones under /api/panel/clans/*. Centralising here means
 * the WHERE clauses (server scoping, "active" filter, etc.) live in
 * exactly one place and can't drift between routes.
 *
 * "Active" everywhere means `disbandedAt IS NULL` and the matching
 * member has `leftAt IS NULL`. Historical rows stay in the table so
 * audit + stats follow-up keep working after Phase 5 lands.
 */

import { and, asc, eq, isNull } from 'drizzle-orm';
import { getDb, schema } from '@/lib/server/db';

/**
 * Compact clan DTO shipped over both the plugin Bearer-auth API and
 * the admin REST surface. Fields that downstream consumers (Fabric
 * mod via Paper, panel UI) need at a glance, no JOINs on the client.
 */
export type ClanDto = {
  id: number;
  tag: string;
  name: string;
  colorHex: string;
  leaderUuid: string;
  createdAt: string;
  // Wave 2 — per-clan PvP toggle. Default `true` = vanilla behaviour;
  // false instructs the plugin's damage listener to cancel
  // EntityDamageByEntityEvent when both sides share this clan.
  friendlyFire: boolean;
  members: ClanMemberDto[];
};

export type ClanMemberDto = {
  playerUuid: string;
  playerName: string;
  role: 'leader' | 'deputy' | 'member';
  joinedAt: string;
};

/** Pull every active clan on a server with its current roster. */
export async function listClansForServer(serverId: number): Promise<ClanDto[]> {
  const db = getDb();

  // Two queries are cheaper than a JOIN here because the roster size
  // is small (<50 members typical) and we want a stable per-clan
  // order on the member list. Pull clans first, then their members
  // in a single IN-style query.
  const clanRows = await db
    .select()
    .from(schema.clans)
    .where(and(eq(schema.clans.serverId, serverId), isNull(schema.clans.disbandedAt)))
    .orderBy(asc(schema.clans.tag));

  if (clanRows.length === 0) return [];

  const memberRows = await db
    .select()
    .from(schema.clanMembers)
    .where(isNull(schema.clanMembers.leftAt));

  const membersByClan = new Map<number, ClanMemberDto[]>();
  for (const m of memberRows) {
    const list = membersByClan.get(m.clanId) ?? [];
    list.push({
      playerUuid: m.playerUuid,
      playerName: m.playerName,
      role: m.role,
      joinedAt: m.joinedAt.toISOString(),
    });
    membersByClan.set(m.clanId, list);
  }

  return clanRows.map((c) => ({
    id: c.id,
    tag: c.tag,
    name: c.name,
    colorHex: c.colorHex,
    leaderUuid: c.leaderUuid,
    createdAt: c.createdAt.toISOString(),
    friendlyFire: c.friendlyFire,
    members: membersByClan.get(c.id) ?? [],
  }));
}

/**
 * Single clan lookup by tag. Tag is case-insensitive on the way in —
 * we store uppercase but tolerate any case the plugin sends so
 * `/clan info king` works regardless of how the operator types it.
 */
export async function getClanByTag(
  serverId: number,
  tag: string,
): Promise<ClanDto | null> {
  const db = getDb();
  const normalised = tag.toUpperCase();

  const [clan] = await db
    .select()
    .from(schema.clans)
    .where(
      and(
        eq(schema.clans.serverId, serverId),
        eq(schema.clans.tag, normalised),
        isNull(schema.clans.disbandedAt),
      ),
    )
    .limit(1);

  if (!clan) return null;

  const members = await db
    .select()
    .from(schema.clanMembers)
    .where(and(eq(schema.clanMembers.clanId, clan.id), isNull(schema.clanMembers.leftAt)));

  return {
    id: clan.id,
    tag: clan.tag,
    name: clan.name,
    colorHex: clan.colorHex,
    leaderUuid: clan.leaderUuid,
    createdAt: clan.createdAt.toISOString(),
    friendlyFire: clan.friendlyFire,
    members: members.map((m) => ({
      playerUuid: m.playerUuid,
      playerName: m.playerName,
      role: m.role,
      joinedAt: m.joinedAt.toISOString(),
    })),
  };
}

/**
 * Resolve a player UUID to their current clan on the given server, or
 * null when they're unclanned. Used by chat / TAB / scoreboard refresh
 * paths so the plugin can paint the right prefix without round-tripping
 * through `listClansForServer`.
 */
export async function getClanForPlayer(
  serverId: number,
  playerUuid: string,
): Promise<ClanDto | null> {
  const db = getDb();

  // Find an active membership matching the player, joined to its clan
  // (must also be active on the right server).
  const rows = await db
    .select({
      clanId: schema.clans.id,
      tag: schema.clans.tag,
    })
    .from(schema.clanMembers)
    .innerJoin(schema.clans, eq(schema.clanMembers.clanId, schema.clans.id))
    .where(
      and(
        eq(schema.clanMembers.playerUuid, playerUuid),
        isNull(schema.clanMembers.leftAt),
        eq(schema.clans.serverId, serverId),
        isNull(schema.clans.disbandedAt),
      ),
    )
    .limit(1);

  if (rows.length === 0) return null;
  return getClanByTag(serverId, rows[0].tag);
}
