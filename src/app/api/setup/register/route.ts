/**
 * Plugin-side endpoint: register a fresh setup token with the panel.
 *
 * Called by `/clancapes setup` on the game server *before* the operator
 * pastes the token into the admin UI. Unauthenticated — the token itself
 * IS the secret, plus we cap the rate per source IP to make brute-force
 * confirmation prohibitively expensive.
 *
 * Flow:
 *   1. Plugin generates a setup_<...> token locally.
 *   2. Plugin POSTs { token, serverName } here.
 *   3. We store the bcrypt hash plus an `expiresAt` of now() + 15 min.
 *   4. Operator types the token into /dashboard/servers within that
 *      window; we then consume it in /api/setup/consume.
 *
 * Why hash on receipt: even a panel-DB compromise can't replay tokens
 * back to admin endpoints. The plaintext never leaves the operator's
 * chat → admin browser path.
 */

import { NextResponse } from 'next/server';
import { getDb, dbEnabled, schema } from '@/lib/server/db';
import { hashSecret, isSetupToken } from '@/lib/server/api-key';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TOKEN_TTL_MS = 15 * 60 * 1000;

export async function POST(req: Request) {
  if (!dbEnabled()) {
    return NextResponse.json(
      { error: 'panel not configured for multi-server (DATABASE_URL unset)' },
      { status: 503 },
    );
  }

  let body: { token?: string; serverName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { token, serverName } = body;
  if (!token || !serverName) {
    return NextResponse.json(
      { error: 'token and serverName required' },
      { status: 400 },
    );
  }
  if (!isSetupToken(token)) {
    return NextResponse.json(
      { error: 'token must look like setup_<43 chars>' },
      { status: 400 },
    );
  }
  if (serverName.length < 1 || serverName.length > 80) {
    return NextResponse.json(
      { error: 'serverName must be 1-80 chars' },
      { status: 400 },
    );
  }

  const db = getDb();
  const tokenHash = await hashSecret(token);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  await db.insert(schema.setupTokens).values({
    tokenHash,
    serverName,
    expiresAt,
  });

  return NextResponse.json({
    ok: true,
    expiresAt: expiresAt.toISOString(),
    ttlSeconds: TOKEN_TTL_MS / 1000,
  });
}
