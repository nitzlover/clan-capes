-- Concurrency hardening — Phase 2.9.
--
-- Denormalises `server_id` onto `clan_members` so the partial-unique
-- "one active membership per player per server" constraint can be
-- expressed in plain Postgres. Without the denormalised column the
-- constraint would need a trigger (the clan→server hop can't appear
-- inside a partial-index predicate).
--
-- Also tightens the color-per-server uniqueness so the application
-- allocator's TOCTOU race (two simultaneous creates both pick the
-- same first-fit palette slot) gets caught by the database with a
-- 23505 we can convert to a clean 409 in the route handler.

-- 1. Add the new column nullable so the backfill can run before the
--    NOT NULL constraint locks the table.
ALTER TABLE "clan_members" ADD COLUMN "server_id" integer;
--> statement-breakpoint

-- 2. Backfill from the owning clan row.
UPDATE "clan_members" cm
SET "server_id" = c."server_id"
FROM "clans" c
WHERE c."id" = cm."clan_id";
--> statement-breakpoint

-- 3. Lock the column down.
ALTER TABLE "clan_members" ALTER COLUMN "server_id" SET NOT NULL;
--> statement-breakpoint

-- 4. FK to servers — cascade on delete so we follow the same rules
--    as the clan→server FK.
ALTER TABLE "clan_members"
  ADD CONSTRAINT "clan_members_server_id_servers_id_fk"
  FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

-- 5. Partial unique: one active membership per (server, player).
--    Past memberships (`left_at IS NOT NULL`) are excluded so a kicked
--    player can re-join a different clan later.
CREATE UNIQUE INDEX "clan_members_active_player_idx"
  ON "clan_members" ("server_id", "player_uuid")
  WHERE "left_at" IS NULL;
--> statement-breakpoint

-- 6. Drop the legacy non-unique colour index; replace with a partial
--    unique index scoped to active clans.
DROP INDEX IF EXISTS "clans_server_color_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX "clans_active_color_idx"
  ON "clans" ("server_id", "color_hex")
  WHERE "disbanded_at" IS NULL;
