-- Phase 6 — per-server operator settings.
--
-- A single jsonb column on `servers` (instead of a sidecar table) so
-- the settings travel with the server row, drop on disband-by-FK
-- cascade for free, and stay readable from a single SELECT in the
-- plugin's poll loop.
--
-- Schema is application-defined. Today's keys (with defaults the
-- repo fills lazily when absent):
--   palette          string[]  curated hex list for allocateUnusedColor
--   createCooldownMs integer   per-player /clan create cooldown (ms)
--   bannerMaxLayers  integer   max banner pattern stack (1..12)
--
-- Adding new keys later is a no-op: the repo's mergeWithDefaults
-- pass keeps unknown keys as-is and supplies missing ones, so the
-- panel UI can ship feature-flagged additions without a migration.

ALTER TABLE "servers"
  ADD COLUMN "settings" jsonb NOT NULL DEFAULT '{}'::jsonb;
