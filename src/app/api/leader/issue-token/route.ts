/**
 * Plugin-facing leader-token issuer.
 *
 * Called from the plugin's `/clan panel` subcommand: the plugin
 * generates a random plaintext token (lpt_…) and POSTs it here with
 * the calling player's UUID. We hash + store the row so the panel can
 * later verify exchange attempts, and respond with the URL the player
 * should visit (typically `${PANEL_PUBLIC_URL}/clan-panel?t=<token>`).
 *
 * Auth: plugin Bearer (same key as the rest of /api/plugin/*).
 * Body: { playerUuid: string, expiresInSec?: number }
 *
 * Side effects:
 *   - any unconsumed token for the same (server, player) is marked
 *     consumed (invalidated). Calling /clan panel a second time
 *     supersedes the previous link so a leaked-but-stale link can't
 *     be redeemed.
 */

import { NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { dbEnabled, getDb, schema } from '@/lib/server/db';
import { PANEL_PUBLIC_URL } from '@/lib/server/env';
import {
  generateLeaderToken,
  hashLeaderToken,
} from '@/lib/server/leader-auth';
import { requirePluginAuth } from '@/lib/server/plugin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const MIN_TTL_SEC = 60;
const DEFAULT_TTL_SEC = 10 * 60;
const MAX_TTL_SEC = 60 * 60;

export async function POST(req: Request) {
  if (!dbEnabled()) {
    return NextResponse.json({ error: 'db disabled' }, { status: 503 });
  }
  const ctx = await requirePluginAuth(req);
  if (!ctx) {
    return NextResponse.json(
      { error: 'invalid or missing plugin API key' },
      { status: 401 },
    );
  }

  let body: { playerUuid?: string; expiresInSec?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  if (!body.playerUuid || !UUID_RE.test(body.playerUuid)) {
    return NextResponse.json({ error: 'invalid playerUuid' }, { status: 400 });
  }
  const ttl = Math.max(
    MIN_TTL_SEC,
    Math.min(
      MAX_TTL_SEC,
      Number.isInteger(body.expiresInSec) ? body.expiresInSec! : DEFAULT_TTL_SEC,
    ),
  );

  const playerUuid = body.playerUuid.toLowerCase();
  const token = generateLeaderToken();
  const tokenHash = hashLeaderToken(token);
  const expiresAt = new Date(Date.now() + ttl * 1000);

  const db = getDb();

  // Invalidate any outstanding tokens for the same (server, player)
  // so re-issuing supersedes — otherwise a leaked-but-unused token
  // from five minutes ago would still be redeemable.
  await db
    .update(schema.leaderTokens)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(schema.leaderTokens.serverId, ctx.id),
        eq(schema.leaderTokens.playerUuid, playerUuid),
        isNull(schema.leaderTokens.consumedAt),
      ),
    );

  await db.insert(schema.leaderTokens).values({
    tokenHash,
    serverId: ctx.id,
    playerUuid,
    expiresAt,
  });

  await db.insert(schema.audit).values({
    serverId: ctx.id,
    actor: `plugin:${ctx.name}`,
    action: 'LEADER_TOKEN_ISSUE',
    target: playerUuid,
    payload: { ttl, expiresAt: expiresAt.toISOString() },
  });

  const url = PANEL_PUBLIC_URL
    ? `${PANEL_PUBLIC_URL.replace(/\/+$/, '')}/clan-panel?t=${encodeURIComponent(token)}`
    : null;

  return NextResponse.json({
    ok: true,
    token,
    expiresAt: expiresAt.toISOString(),
    url,
  });
}
