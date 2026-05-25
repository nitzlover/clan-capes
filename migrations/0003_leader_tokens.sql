-- Phase 4 — short-lived single-use tokens issued by the plugin so a
-- leader (or deputy) can swap their in-game identity for a leader JWT
-- on the web panel.
--
-- Flow:
--   1. In-game player runs `/clan panel`.
--   2. Plugin POSTs to /api/leader/issue-token with the player's UUID;
--      panel hashes the freshly generated token, stores the row with a
--      short expiry (~10 min), returns the plaintext token + URL once.
--   3. Player visits /clan-panel?token=… (or pastes it in /clan-panel),
--      panel verifies, marks consumed_at, mints a leader JWT cookie.
--
-- Tokens are single-use (consumed_at IS NOT NULL ⇒ rejected) and short-
-- lived (expires_at). Expired / consumed rows stay in the table for the
-- short window so the audit log can correlate "who exchanged when" — a
-- nightly cleanup is fine to add later but isn't required for safety.

CREATE TABLE "leader_tokens" (
  "id" serial PRIMARY KEY NOT NULL,
  "token_hash" text NOT NULL,
  "server_id" integer NOT NULL REFERENCES "public"."servers"("id") ON DELETE cascade,
  "player_uuid" uuid NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE UNIQUE INDEX "leader_tokens_hash_idx" ON "leader_tokens" ("token_hash");
--> statement-breakpoint

-- Cheap lookup when the plugin wants to invalidate every active token
-- for a given player (re-issuing /clan panel cancels previous tokens).
CREATE INDEX "leader_tokens_player_idx" ON "leader_tokens" ("server_id", "player_uuid");
