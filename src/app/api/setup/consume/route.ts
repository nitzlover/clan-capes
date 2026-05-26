/**
 * Admin-side endpoint: consume a setup token, mint an API key.
 *
 * Called from the panel's "Register server" modal. Verifies the token
 * against every non-consumed, non-expired row in setup_tokens (bcrypt
 * compare — can't avoid the linear scan because the token plaintext is
 * never seen on the server otherwise). On match:
 *
 *   1. Mark setup_token as consumed (audit trail).
 *   2. Generate a fresh `ck_live_<...>` API key, hash and persist as
 *      a new row in `servers`.
 *   3. Return the plaintext API key exactly once — the admin pastes
 *      it into the plugin's config.yml, the panel keeps only the hash.
 *
 * Linear-scan note: every running setup window has at most a handful
 * of pending tokens (one per server being onboarded), so the O(n)
 * bcrypt compare is fine. If onboarding ever scales into the
 * thousands, partition by serverName at registration time.
 */

import { NextResponse } from 'next/server';
import { and, eq, isNull, gt } from 'drizzle-orm';
import { requireAuth } from '@/lib/server/auth';
import { getDb, dbEnabled, schema } from '@/lib/server/db';
import {
  extractApiKeyPrefix,
  generateApiKey,
  hashSecret,
  isSetupToken,
  verifySecret,
} from '@/lib/server/api-key';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const user = requireAuth(req);
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!dbEnabled()) {
    return NextResponse.json(
      { error: 'panel not configured for multi-server (DATABASE_URL unset)' },
      { status: 503 },
    );
  }

  let body: { token?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const token = body.token?.trim();
  if (!token || !isSetupToken(token)) {
    return NextResponse.json(
      { error: 'token must look like setup_<43 chars>' },
      { status: 400 },
    );
  }

  const db = getDb();
  const now = new Date();

  // Pull every still-eligible row and bcrypt-compare in-process. We
  // can't index by token because the plaintext is never persisted,
  // only the hash.
  const candidates = await db
    .select()
    .from(schema.setupTokens)
    .where(
      and(
        isNull(schema.setupTokens.consumedAt),
        gt(schema.setupTokens.expiresAt, now),
      ),
    );

  let match: (typeof candidates)[number] | null = null;
  for (const row of candidates) {
    if (await verifySecret(token, row.tokenHash)) {
      match = row;
      break;
    }
  }
  if (!match) {
    return NextResponse.json(
      { error: 'token not found, already consumed, or expired' },
      { status: 404 },
    );
  }

  const apiKey = generateApiKey();
  const apiKeyHash = await hashSecret(apiKey);
  const apiKeyPrefix = extractApiKeyPrefix(apiKey);

  // Mark consumed first so a concurrent consume request can't double-
  // mint. The two writes are sequential; under contention the second
  // consume sees consumedAt set and falls into the candidates filter
  // out, returning 404 to the loser.
  const [updated] = await db
    .update(schema.setupTokens)
    .set({ consumedAt: now })
    .where(
      and(
        eq(schema.setupTokens.id, match.id),
        isNull(schema.setupTokens.consumedAt),
      ),
    )
    .returning();
  if (!updated) {
    return NextResponse.json(
      { error: 'token already consumed' },
      { status: 409 },
    );
  }

  const [server] = await db
    .insert(schema.servers)
    .values({
      name: match.serverName,
      apiKeyHash,
      apiKeyPrefix,
    })
    .returning();

  await db.insert(schema.audit).values({
    serverId: server.id,
    actor: user.sub,
    action: 'SERVER_REGISTER',
    target: match.serverName,
    payload: { tokenId: match.id },
  });

  return NextResponse.json({
    ok: true,
    server: {
      id: server.id,
      name: server.name,
      createdAt: server.createdAt.toISOString(),
    },
    // Plaintext, shown to admin exactly once. Panel UI must surface
    // a copy button + warning that this won't be retrievable later.
    apiKey,
  });
}
