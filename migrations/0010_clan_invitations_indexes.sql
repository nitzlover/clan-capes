-- Feature: clan invitations endpoints (Wave 4 unstub).
--
-- The clan_invitations table has shipped since the initial schema
-- but the panel never exposed endpoints for it (the plugin's
-- /clan invite|accept|decline stayed stubbed). This migration adds
-- the indexes the new /api/plugin/clans/[tag]/invites and
-- /api/plugin/invites/[id]/{accept,decline} endpoints rely on so
-- the read paths stay fast as the table grows.
--
-- No data backfill — every existing row is already pending or
-- expired and the lookup routes filter on status + expires_at.

-- Per-invitee read path: GET /api/plugin/players/{uuid}/invites
-- filters on (invitee_uuid, status='pending', expires_at > now()).
-- Partial index keeps the index hot — declined / accepted / expired
-- rows aren't part of the working set.
CREATE INDEX IF NOT EXISTS "clan_invitations_invitee_pending_idx"
  ON "clan_invitations" ("invitee_uuid", "expires_at")
  WHERE "status" = 'pending';
--> statement-breakpoint

-- Per-clan read path: leader/deputy can ask "who has a pending
-- invite to my clan" via the dashboard, plus the duplicate-invite
-- guard on POST .../invites filters on (clan_id, invitee_uuid,
-- status='pending').
CREATE INDEX IF NOT EXISTS "clan_invitations_clan_pending_idx"
  ON "clan_invitations" ("clan_id", "invitee_uuid")
  WHERE "status" = 'pending';
--> statement-breakpoint

-- Sweep job: an expiry cleanup can scan a single index by
-- expires_at instead of a sequential scan of the whole table.
CREATE INDEX IF NOT EXISTS "clan_invitations_expires_at_idx"
  ON "clan_invitations" ("expires_at")
  WHERE "status" = 'pending';
