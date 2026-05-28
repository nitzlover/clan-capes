-- Wave 2 — announcements + clan-level friendly fire toggle.
--
-- `clan_announcements`: one row per clan, leader / deputy can edit
-- body, plugin polls /api/plugin/announcements every 5 min to render
-- the message inside `/clan info` and on the panel banner. Cascade
-- on disband so the row vanishes with the clan.
--
-- `clans.friendly_fire`: per-clan toggle (default true = vanilla
-- behaviour) consumed by the future PvP listener — Wave 3 wires it
-- to `EntityDamageByEntityEvent.setCancelled(true)` when both sides
-- of the swing share a clan and the flag is false. Stored as a real
-- column instead of `clans.settings.friendly_fire` so the plugin
-- repository can project it directly without a JSONB unpack on each
-- refresh.

CREATE TABLE "clan_announcements" (
  "clan_id" integer PRIMARY KEY REFERENCES "public"."clans"("id") ON DELETE cascade,
  "body" text NOT NULL,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_by" text NOT NULL
);
--> statement-breakpoint

-- Default `true` matches vanilla PvP rules — existing clans behave
-- exactly as before until an operator flips the switch. NOT NULL so
-- the plugin always gets a boolean back without null-checks.
ALTER TABLE "clans" ADD COLUMN "friendly_fire" boolean NOT NULL DEFAULT true;
