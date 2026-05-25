/**
 * Leader token → JWT cookie exchange.
 *
 * No auth required (the token IS the auth). Body: `{ token: string }`.
 * On success:
 *   - marks `leader_tokens.consumed_at = now()`
 *   - resolves the player → clan via the same logic the plugin uses
 *   - mints a leader JWT and sets the HttpOnly cookie
 *   - audits the exchange
 *
 * Rejects:
 *   - token not found / hash mismatch  → 401
 *   - token already consumed           → 401
 *   - token expired                    → 401
 *   - player is not in any clan        → 404 (transient — they
 *                                       may have been kicked since
 *                                       the plugin issued the token)
 *   - player is "member" (not leader/  → 403 (the panel is for clan
 *     deputy)                          managers)
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { getClanForPlayer } from '@/lib/server/clan-repo';
import { dbEnabled, getDb, schema } from '@/lib/server/db';
import {
  hashLeaderToken,
  leaderCookieHeader,
  signLeader,
  type LeaderJwtPayload,
} from '@/lib/server/leader-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TTL_SEC = 60 * 60 * 12;

export async function POST(req: Request) {
  if (!dbEnabled()) {
    return NextResponse.json({ error: 'db disabled' }, { status: 503 });
  }
  let body: { token?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  if (!body.token || typeof body.token !== 'string') {
    return NextResponse.json({ error: 'token required' }, { status: 400 });
  }

  const db = getDb();
  const tokenHash = hashLeaderToken(body.token);
  const [row] = await db
    .select()
    .from(schema.leaderTokens)
    .where(eq(schema.leaderTokens.tokenHash, tokenHash))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: 'invalid token' }, { status: 401 });
  }
  if (row.consumedAt) {
    return NextResponse.json({ error: 'token already used' }, { status: 401 });
  }
  if (row.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: 'token expired' }, { status: 401 });
  }

  const clan = await getClanForPlayer(row.serverId, row.playerUuid);
  if (!clan) {
    return NextResponse.json(
      { error: 'player is not in any clan on this server' },
      { status: 404 },
    );
  }
  const member = clan.members.find(
    (m) => m.playerUuid.toLowerCase() === row.playerUuid.toLowerCase(),
  );
  if (!member) {
    // Shouldn't happen — getClanForPlayer returns the clan only when
    // there's a matching active membership — but guard so a torn row
    // doesn't 500.
    return NextResponse.json({ error: 'membership row missing' }, { status: 404 });
  }
  if (member.role !== 'leader' && member.role !== 'deputy') {
    return NextResponse.json(
      { error: 'only leaders and deputies can use the clan panel' },
      { status: 403 },
    );
  }

  // Mark the token consumed BEFORE minting the JWT — if the JWT sign
  // somehow throws, the token is already burnt and can't be replayed.
  await db
    .update(schema.leaderTokens)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(schema.leaderTokens.id, row.id),
        eq(schema.leaderTokens.tokenHash, tokenHash),
      ),
    );

  const payload: LeaderJwtPayload = {
    sub: row.playerUuid.toLowerCase(),
    serverId: row.serverId,
    clan: clan.tag,
    role: member.role,
  };
  const jwt = signLeader(payload, TTL_SEC);

  await db.insert(schema.audit).values({
    serverId: row.serverId,
    actor: `leader:${row.playerUuid}`,
    action: 'LEADER_TOKEN_EXCHANGE',
    target: clan.tag,
    payload: { role: member.role, ttl: TTL_SEC },
  });

  return NextResponse.json(
    {
      ok: true,
      clan: clan.tag,
      role: member.role,
      playerUuid: row.playerUuid,
      playerName: member.playerName,
    },
    {
      headers: {
        'Set-Cookie': leaderCookieHeader(jwt, TTL_SEC),
      },
    },
  );
}
