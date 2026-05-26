-- Audit batch tail — Bearer-key prefix index.
--
-- requirePluginAuth used to linear-scan every `servers` row and run
-- a bcrypt compare against each stored hash to identify the caller.
-- At 100 servers that's ~30 ms of CPU per request; at 1k servers the
-- panel chews a whole core just answering /api/plugin/heartbeat.
--
-- Fix: store a short plaintext prefix of the API key (the first
-- 16 chars — "ck_live_<8 url-safe chars>"). The prefix doesn't reveal
-- the rest of the 32-byte key, and a btree index over it lets the
-- lookup go straight to the single matching row. We bcrypt-compare
-- just that row, not the whole table.
--
-- Legacy rows (issued before this migration) have an empty prefix
-- and stay on the linear-scan path; the next time the operator
-- rotates a key, the new prefix lands and the lookup is fast.

ALTER TABLE "servers"
  ADD COLUMN "api_key_prefix" text NOT NULL DEFAULT '';
--> statement-breakpoint

CREATE INDEX "servers_api_key_prefix_idx"
  ON "servers" ("api_key_prefix")
  WHERE "api_key_prefix" <> '';
