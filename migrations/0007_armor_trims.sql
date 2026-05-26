-- Feature: clan-livery armor trims.
--
-- Each clan can register a separate (material, pattern) trim per armor
-- slot (helmet / chestplate / leggings / boots). When a member equips
-- a piece, the plugin's ArmorTrimListener stamps the trim into the
-- item's NBT — same pattern as banner-on-shield, preserving enchants
-- + custom names because we only mutate the trim component.
--
-- Storage: one row per (clan_id, slot). Composite PK lets us upsert
-- on save without a separate select-then-insert round-trip.

-- enum keeps the slot values in lock-step with Minecraft's
-- EquipmentSlot vocabulary so the plugin can fall through enum-name
-- lookup without a translation table.
CREATE TYPE "public"."armor_slot" AS ENUM ('head', 'chest', 'legs', 'feet');
--> statement-breakpoint

CREATE TABLE "clan_armor_trims" (
  "clan_id" integer NOT NULL REFERENCES "public"."clans"("id") ON DELETE cascade,
  "slot" "armor_slot" NOT NULL,
  -- Vanilla TrimMaterial registry key without the "minecraft:" prefix
  -- ("iron", "gold", "diamond", "netherite", "amethyst", "copper",
  -- "emerald", "lapis", "quartz", "redstone").
  "material" text NOT NULL,
  -- Vanilla TrimPattern registry key without prefix ("sentry", "dune",
  -- "coast", "wild", "ward", "eye", "vex", "tide", "snout", "rib",
  -- "spire", "wayfinder", "shaper", "silence", "raiser", "host",
  -- "flow", "bolt").
  "pattern" text NOT NULL,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_by" text NOT NULL,
  PRIMARY KEY ("clan_id", "slot")
);
--> statement-breakpoint

-- Index for the plugin's bulk fetch (one row per (clan, slot) joined
-- to active clans on a server).
CREATE INDEX "clan_armor_trims_clan_idx" ON "clan_armor_trims" ("clan_id");
