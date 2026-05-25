-- Phase 5 — PvP kill events + per-season aggregates.
--
-- Three tables shipped together so the upsert sequence inside the
-- ingest endpoint stays a single transaction:
--
--   kill_events   row-per-kill audit log (immutable history)
--   player_stats  rolling counters keyed by (server, player, season)
--   clan_stats    rolling counters keyed by (clan, season)
--
-- "Season" is a plain string column — the panel writes 'lifetime'
-- alongside the current season key on every ingest, so a single
-- query against player_stats / clan_stats can answer either the
-- live leaderboard or the all-time record without joining
-- kill_events. Season key format is application-defined ('2026-Q2',
-- 'pre1', etc.) — we keep it open so a future operator-set reset
-- doesn't need a migration.

-- Per-server "currently active" season pointer. The panel reads this
-- at ingest time so the same kill never lands under two seasons.
-- Default empty string means "no season started yet" which the
-- bootstrap fills in on first kill.
ALTER TABLE "servers"
  ADD COLUMN "current_season_key" text NOT NULL DEFAULT '';
--> statement-breakpoint

CREATE TABLE "kill_events" (
  "id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "server_id" integer NOT NULL REFERENCES "public"."servers"("id") ON DELETE cascade,
  "killer_uuid" uuid NOT NULL,
  "victim_uuid" uuid NOT NULL,
  -- Snapshot the clan-at-time-of-kill so renaming / disbanding clans
  -- doesn't rewrite history. Nullable because either party may be
  -- unclanned.
  "killer_clan_id" integer REFERENCES "public"."clans"("id") ON DELETE set null,
  "victim_clan_id" integer REFERENCES "public"."clans"("id") ON DELETE set null,
  "season_key" text NOT NULL,
  "occurred_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX "kill_events_server_season_idx"
  ON "kill_events" ("server_id", "season_key");
--> statement-breakpoint
CREATE INDEX "kill_events_killer_idx"
  ON "kill_events" ("server_id", "killer_uuid");
--> statement-breakpoint
CREATE INDEX "kill_events_victim_idx"
  ON "kill_events" ("server_id", "victim_uuid");
--> statement-breakpoint

CREATE TABLE "player_stats" (
  "server_id" integer NOT NULL REFERENCES "public"."servers"("id") ON DELETE cascade,
  "player_uuid" uuid NOT NULL,
  "season_key" text NOT NULL,
  "kills" integer NOT NULL DEFAULT 0,
  "deaths" integer NOT NULL DEFAULT 0,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("server_id", "player_uuid", "season_key")
);
--> statement-breakpoint

CREATE INDEX "player_stats_server_season_idx"
  ON "player_stats" ("server_id", "season_key");
--> statement-breakpoint

CREATE TABLE "clan_stats" (
  "clan_id" integer NOT NULL REFERENCES "public"."clans"("id") ON DELETE cascade,
  "season_key" text NOT NULL,
  "kills" integer NOT NULL DEFAULT 0,
  "deaths" integer NOT NULL DEFAULT 0,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("clan_id", "season_key")
);
--> statement-breakpoint

CREATE INDEX "clan_stats_season_idx" ON "clan_stats" ("season_key");
