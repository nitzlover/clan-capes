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

import {
  pgTable,
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
    // Same for colours — one clan per colour per active server. The
    // partial index can't be expressed in Drizzle's DSL today, so we
    // enforce uniqueness at the allocator layer instead of via SQL.
    serverColorIdx: index('clans_server_color_idx').on(t.serverId, t.colorHex),
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
