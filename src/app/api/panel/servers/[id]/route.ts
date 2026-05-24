/**
 * Admin-side endpoint: rotate or delete a registered server.
 *
 * PATCH — rotate the API key. Returns the new plaintext exactly once;
 * the old key stops working immediately on commit. Useful when an
 * operator suspects the api_key has leaked or when handing the
 * server off to a new admin.
 *
 * DELETE — fully deregister the server. Cascades to clans, members,
 * banners etc. via the FK ON DELETE CASCADE chains. Audit records
 * stay (server_id is SET NULL there so the trail survives).
 */

import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireAuth } from '@/lib/server/auth';
import { dbEnabled, getDb, schema } from '@/lib/server/db';
import { generateApiKey, hashSecret } from '@/lib/server/api-key';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
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

  const { id: rawId } = await ctx.params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'invalid server id' }, { status: 400 });
  }

  const apiKey = generateApiKey();
  const apiKeyHash = await hashSecret(apiKey);

  const db = getDb();
  const [server] = await db
    .update(schema.servers)
    .set({ apiKeyHash })
    .where(eq(schema.servers.id, id))
    .returning();

  if (!server) {
    return NextResponse.json({ error: 'server not found' }, { status: 404 });
  }

  await db.insert(schema.audit).values({
    serverId: server.id,
    actor: user.sub,
    action: 'API_KEY_ROTATE',
    target: server.name,
    payload: null,
  });

  return NextResponse.json({
    ok: true,
    server: { id: server.id, name: server.name },
    apiKey,
  });
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
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

  const { id: rawId } = await ctx.params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'invalid server id' }, { status: 400 });
  }

  const db = getDb();
  const [server] = await db
    .delete(schema.servers)
    .where(eq(schema.servers.id, id))
    .returning();

  if (!server) {
    return NextResponse.json({ error: 'server not found' }, { status: 404 });
  }

  await db.insert(schema.audit).values({
    serverId: null,
    actor: user.sub,
    action: 'SERVER_DELETE',
    target: server.name,
    payload: { previousId: server.id },
  });

  return NextResponse.json({ ok: true });
}
