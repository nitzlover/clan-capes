/**
 * Postgres schema — single source of truth, Drizzle-typed.
 *
 * Multi-server from day one. Every domain row carries `serverId` so a
 * single panel deploy can host an unbounded number of game servers,
 * each scoped behind its own API key and the one-time-pass setup flow
 * from Phase 1.
 *
 * Naming conventions:
 *   - Tables: plural snake_case (`clan_members`).
 *   - Columns: snake_case in SQL, camelCase in the TS bindings via
 *     Drizzle's column-name argument.
 *   - Time columns: `timestamp with time zone`, named `<verb>At`.
 *   - Foreign keys: `<table>_id` referencing `<table>.id`, ON DELETE
 *     CASCADE for owned children, SET NULL for soft refs.
 *
 * Phase 0 ships only the tables needed by Phase 1 + 2 (servers, setup
 * tokens, clans, members, audit). Stats / approvals / kill events join
 * in later phases — see clans_plan.md.
 */

import { sql } from 'drizzle-orm';
import {
  pgTable,
  primaryKey,
  serial,
  text,
  integer,
  timestamp,
  uniqueIndex,
  index,
  jsonb,
  bigint,
  uuid,
  varchar,
  pgEnum,
} from 'drizzle-orm/pg-core';

// ─── Enums ────────────────────────────────────────────────────────────

export const memberRole = pgEnum('member_role', ['leader', 'deputy', 'member']);
export const approvalKind = pgEnum('approval_kind', ['cape']);
export const approvalStatus = pgEnum('approval_status', [
  'pending',
  'approved',
  'rejected',
]);
export const inviteStatus = pgEnum('invite_status', [
  'pending',
  'accepted',
  'declined',
  'expired',
]);

// ─── Servers ──────────────────────────────────────────────────────────

/**
 * One row per registered game server. `apiKeyHash` is a bcrypt-style
 * hash of the long-term key issued at the end of the one-time-pass
 * setup flow — the plaintext is shown to the operator exactly once and
 * never stored. `name` is admin-set, purely a UI label.
 */
export const servers = pgTable(
  'servers',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    apiKeyHash: text('api_key_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    // Phase-5 active season pointer. Set on first kill ingest, bumped
    // by the admin "reset season" button. Empty = "no season started
    // yet" — the ingest endpoint fills it lazily.
    currentSeasonKey: text('current_season_key').notNull().default(''),
  },
  (t) => ({
    nameIdx: uniqueIndex('servers_name_idx').on(t.name),
  }),
);

/**
 * One-time-pass setup tokens. Created by the plugin's `/clancapes
 * setup` command, consumed by the panel's "Register server" flow.
 * `consumedAt` set on success — token is then dead even if leaked.
 */
export const setupTokens = pgTable(
  'setup_tokens',
  {
    id: serial('id').primaryKey(),
    tokenHash: text('token_hash').notNull(),
    serverName: text('server_name').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    tokenHashIdx: uniqueIndex('setup_tokens_hash_idx').on(t.tokenHash),
  }),
);

// ─── Clans ────────────────────────────────────────────────────────────

/**
 * Top-level clan record. `tag` is the short identifier shown in chat
 * (2–6 uppercase alphanumeric), `colorHex` is the single colour used
 * for chat prefix, above-head nametag and TAB list. Disbanded clans
 * keep their row (set `disbandedAt`) so audit history and migration
 * imports stay coherent — but they're filtered out of every "active"
 * query.
 */
export const clans = pgTable(
  'clans',
  {
    id: serial('id').primaryKey(),
    serverId: integer('server_id')
      .notNull()
      .references(() => servers.id, { onDelete: 'cascade' }),
    tag: varchar('tag', { length: 6 }).notNull(),
    name: text('name').notNull(),
    colorHex: varchar('color_hex', { length: 7 }).notNull(),
    leaderUuid: uuid('leader_uuid').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    disbandedAt: timestamp('disbanded_at', { withTimezone: true }),
  },
  (t) => ({
    // A tag is unique per server, not globally — two servers can each
    // have a `KING` clan without collision.
    tagPerServerIdx: uniqueIndex('clans_tag_per_server_idx').on(
      t.serverId,
      t.tag,
    ),
    // Partial unique on active clans only: one colour per server.
    // Disbanded clans retain their old colour for audit history but
    // don't block re-use.
    activeColorIdx: uniqueIndex('clans_active_color_idx')
      .on(t.serverId, t.colorHex)
      .where(sql`${t.disbandedAt} IS NULL`),
  }),
);

/**
 * Clan membership. A player can belong to at most one active clan per
 * server at a time, enforced via the partial unique index below
 * (active = `leftAt IS NULL`). Past memberships stay as historical
 * rows for stats follow-up.
 */
export const clanMembers = pgTable(
  'clan_members',
  {
    id: serial('id').primaryKey(),
    clanId: integer('clan_id')
      .notNull()
      .references(() => clans.id, { onDelete: 'cascade' }),
    // Denormalised from `clans.server_id` so the partial-unique index
    // below can enforce "one active clan per player per server" without
    // a cross-table trigger. Backfilled by migration 0002.
    serverId: integer('server_id')
      .notNull()
      .references(() => servers.id, { onDelete: 'cascade' }),
    playerUuid: uuid('player_uuid').notNull(),
    playerName: text('player_name').notNull(),
    role: memberRole('role').notNull().default('member'),
    joinedAt: timestamp('joined_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    leftAt: timestamp('left_at', { withTimezone: true }),
  },
  (t) => ({
    clanIdx: index('clan_members_clan_idx').on(t.clanId),
    playerIdx: index('clan_members_player_idx').on(t.playerUuid),
    // Partial unique: a player may have at most one active membership
    // per server. Past memberships (leftAt IS NOT NULL) stay for stats.
    activePlayerIdx: uniqueIndex('clan_members_active_player_idx')
      .on(t.serverId, t.playerUuid)
      .where(sql`${t.leftAt} IS NULL`),
  }),
);

/**
 * Clan invitations. Issued by leaders / deputies, consumed by the
 * invitee via `/clan accept` or the panel. Expires after a short
 * window so dropped invites don't pile up.
 */
export const clanInvitations = pgTable('clan_invitations', {
  id: serial('id').primaryKey(),
  clanId: integer('clan_id')
    .notNull()
    .references(() => clans.id, { onDelete: 'cascade' }),
  inviteeUuid: uuid('invitee_uuid').notNull(),
  inviteeName: text('invitee_name').notNull(),
  inviterUuid: uuid('inviter_uuid').notNull(),
  status: inviteStatus('status').notNull().default('pending'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Per-clan shield banner specification. One row per clan; cleared
 * on disband via the FK cascade. Patterns ship as a JSON array of
 * `{ color, pattern }` objects matching the NBT shape vanilla uses,
 * so the plugin reads + applies them without translation.
 *
 * `updatedBy` is informational (admin username or in-game player
 * name) — the FK to `servers` is implicit via the clan row's
 * `server_id`, no extra column needed.
 */
export const clanBanners = pgTable(
  'clan_banners',
  {
    clanId: integer('clan_id')
      .primaryKey()
      .references(() => clans.id, { onDelete: 'cascade' }),
    baseColor: integer('base_color').notNull(),
    patterns: jsonb('patterns').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedBy: text('updated_by').notNull(),
  },
);

// ─── Leader-panel tokens (Phase 4) ────────────────────────────────────

/**
 * Short-lived single-use tokens minted by the plugin so a clan
 * leader (or deputy) can exchange their in-game identity for a
 * leader JWT on the web panel. Token plaintext lives only in the
 * player's chat output until they paste it into /clan-panel — what's
 * stored is the hash.
 *
 * Issued by `POST /api/leader/issue-token` (plugin Bearer auth),
 * consumed by `POST /api/leader/exchange-token` (no auth — the
 * token IS the auth). Rows are kept after consumption so the audit
 * log can answer "who exchanged when" without joining live state.
 */
export const leaderTokens = pgTable(
  'leader_tokens',
  {
    id: serial('id').primaryKey(),
    tokenHash: text('token_hash').notNull(),
    serverId: integer('server_id')
      .notNull()
      .references(() => servers.id, { onDelete: 'cascade' }),
    playerUuid: uuid('player_uuid').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    hashIdx: uniqueIndex('leader_tokens_hash_idx').on(t.tokenHash),
    playerIdx: index('leader_tokens_player_idx').on(t.serverId, t.playerUuid),
  }),
);

// ─── Stats (Phase 5) ──────────────────────────────────────────────────

/**
 * Immutable row-per-kill audit log. Aggregates are computed via the
 * `player_stats` / `clan_stats` rollup tables for fast leaderboard
 * reads; this table lets a future audit / appeal flow replay the
 * actual events without trusting the rollups. Both clan FKs are
 * nullable so unclanned-vs-unclanned kills still record.
 */
export const killEvents = pgTable(
  'kill_events',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    serverId: integer('server_id')
      .notNull()
      .references(() => servers.id, { onDelete: 'cascade' }),
    killerUuid: uuid('killer_uuid').notNull(),
    victimUuid: uuid('victim_uuid').notNull(),
    killerClanId: integer('killer_clan_id').references(() => clans.id, {
      onDelete: 'set null',
    }),
    victimClanId: integer('victim_clan_id').references(() => clans.id, {
      onDelete: 'set null',
    }),
    seasonKey: text('season_key').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    serverSeasonIdx: index('kill_events_server_season_idx').on(t.serverId, t.seasonKey),
    killerIdx: index('kill_events_killer_idx').on(t.serverId, t.killerUuid),
    victimIdx: index('kill_events_victim_idx').on(t.serverId, t.victimUuid),
  }),
);

/**
 * Rolling per-player counters. Composite PK (server, player, season)
 * so the same player keeps separate buckets across servers AND
 * across seasons. Lifetime totals live under `season_key = 'lifetime'`
 * — the ingest endpoint upserts BOTH the current season row and the
 * lifetime row on every kill.
 */
export const playerStats = pgTable(
  'player_stats',
  {
    serverId: integer('server_id')
      .notNull()
      .references(() => servers.id, { onDelete: 'cascade' }),
    playerUuid: uuid('player_uuid').notNull(),
    seasonKey: text('season_key').notNull(),
    kills: integer('kills').notNull().default(0),
    deaths: integer('deaths').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pk: primaryKey({
      name: 'player_stats_pkey',
      columns: [t.serverId, t.playerUuid, t.seasonKey],
    }),
    serverSeasonIdx: index('player_stats_server_season_idx').on(t.serverId, t.seasonKey),
  }),
);

/**
 * Rolling per-clan counters. Same shape as {@link playerStats} but
 * keyed by clan id. The "lifetime" season key is also used for the
 * disbanded-clans hall-of-fame so historical rosters keep their
 * record.
 */
export const clanStats = pgTable(
  'clan_stats',
  {
    clanId: integer('clan_id')
      .notNull()
      .references(() => clans.id, { onDelete: 'cascade' }),
    seasonKey: text('season_key').notNull(),
    kills: integer('kills').notNull().default(0),
    deaths: integer('deaths').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pk: primaryKey({
      name: 'clan_stats_pkey',
      columns: [t.clanId, t.seasonKey],
    }),
    seasonIdx: index('clan_stats_season_idx').on(t.seasonKey),
  }),
);

// ─── Audit ────────────────────────────────────────────────────────────

/**
 * Audit trail — replaces the file-based audit.log. `payload` keeps
 * arbitrary structured detail per event so we don't need a new
 * column every time a new event type adds metadata.
 */
export const audit = pgTable(
  'audit',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    serverId: integer('server_id').references(() => servers.id, {
      onDelete: 'set null',
    }),
    actor: text('actor').notNull(),
    action: text('action').notNull(),
    target: text('target'),
    payload: jsonb('payload'),
    ts: timestamp('ts', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tsIdx: index('audit_ts_idx').on(t.ts),
    actorIdx: index('audit_actor_idx').on(t.actor),
    serverIdx: index('audit_server_idx').on(t.serverId),
  }),
);
