-- Feature: scheduled PvP events (Wave 5 foundation).
--
-- Captures the runtime state + analytics surface for Airdrop and
-- King-of-the-Hill events. Designed multi-server from day one so a
-- single panel can host event configs + history across every linked
-- server independently.
--
-- The state machine lives in the plugin; this schema is the
-- persistence target. status transitions happen at the plugin side
-- and get POSTed to the panel through /api/plugin/events/* so the
-- panel and admin UI stay in sync without polling the world.

-- event_type — fixed taxonomy. Add a new variant on each new event
-- design (no implicit "other" bucket so the analytics surface stays
-- honest).
CREATE TYPE "public"."event_type" AS ENUM ('airdrop', 'koth');
--> statement-breakpoint

-- event_status — lifecycle. `pending` is the brief window between
-- scheduler trigger and prep stage so the row exists for a join
-- against /api/plugin/events even if prep hasn't fully started.
-- `cancelled` covers operator-aborted + min-clans-not-met aborts.
CREATE TYPE "public"."event_status" AS ENUM (
  'pending', 'prep', 'landing', 'finale', 'ended', 'cancelled'
);
--> statement-breakpoint

-- Per-run event row. zone_center_x / zone_center_z carry the
-- horizontal centre as plain integers (block coordinates); the
-- world's Y axis is irrelevant for the boundary check, drop is
-- spawned at the ground level at run time.
--
-- config_snapshot captures the params at start (interval / duration
-- / radius / loot pool) so a later config edit doesn't retroactively
-- rewrite history.
CREATE TABLE "events" (
  "id" serial PRIMARY KEY,
  "server_id" integer NOT NULL
    REFERENCES "public"."servers"("id") ON DELETE cascade,
  "type" "event_type" NOT NULL,
  "status" "event_status" NOT NULL DEFAULT 'pending',
  "started_at" timestamp with time zone NOT NULL DEFAULT now(),
  "ended_at" timestamp with time zone,
  "zone_center_x" integer NOT NULL,
  "zone_center_z" integer NOT NULL,
  "zone_radius" integer NOT NULL,
  "winner_clan_id" integer
    REFERENCES "public"."clans"("id") ON DELETE set null,
  "config_snapshot" jsonb NOT NULL DEFAULT '{}'::jsonb
);
--> statement-breakpoint

CREATE INDEX "events_server_started_idx"
  ON "events" ("server_id", "started_at" DESC);
CREATE INDEX "events_server_type_idx"
  ON "events" ("server_id", "type");
--> statement-breakpoint

-- Per-participant counters per event.
-- joined_at fires when the player first entered the zone; the
-- plugin can update it again on a comeback re-entry without
-- breaking the PK because (event_id, player_uuid) is stable.
-- eliminated_at null = still alive at last write.
CREATE TABLE "event_participants" (
  "event_id" integer NOT NULL
    REFERENCES "public"."events"("id") ON DELETE cascade,
  "clan_id" integer NOT NULL
    REFERENCES "public"."clans"("id") ON DELETE cascade,
  "player_uuid" uuid NOT NULL,
  "kills" integer NOT NULL DEFAULT 0,
  "deaths" integer NOT NULL DEFAULT 0,
  "joined_at" timestamp with time zone NOT NULL DEFAULT now(),
  "eliminated_at" timestamp with time zone,
  PRIMARY KEY ("event_id", "player_uuid")
);
--> statement-breakpoint

CREATE INDEX "event_participants_clan_idx"
  ON "event_participants" ("event_id", "clan_id");
--> statement-breakpoint

-- Immutable kill log scoped to an event. Mirrors the global
-- kill_events table from phase 5 but with event_id so leaderboards
-- can filter without joining a windowed kill_events scan.
CREATE TABLE "event_kills" (
  "id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "event_id" integer NOT NULL
    REFERENCES "public"."events"("id") ON DELETE cascade,
  "killer_uuid" uuid NOT NULL,
  "victim_uuid" uuid NOT NULL,
  "killer_clan_id" integer
    REFERENCES "public"."clans"("id") ON DELETE set null,
  "victim_clan_id" integer
    REFERENCES "public"."clans"("id") ON DELETE set null,
  "occurred_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX "event_kills_event_idx" ON "event_kills" ("event_id");
--> statement-breakpoint

-- Per-server per-type config. interval_minutes is the trigger
-- cadence (2 h = 120 for airdrop, 5 h = 300 for koth as starting
-- defaults). duration_minutes covers the active window
-- (prep + landing + finale). radius_blocks defines the zone size.
-- `payload` carries variant-specific knobs (loot pool selector,
-- structure id, etc.) without forcing a column per parameter.
CREATE TABLE "event_config" (
  "server_id" integer NOT NULL
    REFERENCES "public"."servers"("id") ON DELETE cascade,
  "type" "event_type" NOT NULL,
  "enabled" boolean NOT NULL DEFAULT true,
  "interval_minutes" integer NOT NULL,
  "duration_minutes" integer NOT NULL,
  "radius_blocks" integer NOT NULL,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_by" text NOT NULL DEFAULT 'system',
  PRIMARY KEY ("server_id", "type")
);
