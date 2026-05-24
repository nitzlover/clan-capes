/**
 * Plugin heartbeat. The Paper plugin POSTs here every few minutes so
 * the panel knows the server is alive and the API key is still valid.
 *
 * Side effects:
 *   - {@link requirePluginAuth} bumps `servers.last_seen_at` on every
 *     successful match — that's what surfaces the "last seen" column
 *     on /dashboard/servers.
 *   - Optional `payload` body is appended to the audit log so admins
 *     can grep for plugin version drift or other telemetry.
 *
 * No body is required. The endpoint exists primarily to give the
 * plugin a cheap, frequent excuse to prove its Bearer key still
 * works — if heartbeat starts returning 401 the plugin can surface
 * an in-game warning instead of silently going stale.
 */

import { NextResponse } from 'next/server';
import { getDb, dbEnabled, schema } from '@/lib/server/db';
import { requirePluginAuth } from '@/lib/server/plugin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!dbEnabled()) {
    return NextResponse.json(
      { error: 'panel not configured for multi-server (DATABASE_URL unset)' },
      { status: 503 },
    );
  }

  const ctx = await requirePluginAuth(req);
  if (!ctx) {
    return NextResponse.json(
      { error: 'invalid or missing plugin API key' },
      { status: 401 },
    );
  }

  // Heartbeat body is optional; if present we audit it so version
  // drift across plugin upgrades is grep-able from /dashboard/audit.
  let payload: Record<string, unknown> | null = null;
  try {
    const body = await req.json();
    if (body && typeof body === 'object') {
      payload = body as Record<string, unknown>;
    }
  } catch {
    // No body or invalid JSON — fine, heartbeat is allowed to be empty.
  }

  if (payload) {
    const db = getDb();
    // Only audit substantive heartbeats — silent pings would flood the
    // log. "Substantive" = the plugin sent a version string or some
    // other named field we'd care to grep for later.
    if (Object.keys(payload).length > 0) {
      await db.insert(schema.audit).values({
        serverId: ctx.id,
        actor: `plugin:${ctx.name}`,
        action: 'HEARTBEAT',
        target: null,
        payload,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    server: { id: ctx.id, name: ctx.name },
    serverTime: new Date().toISOString(),
  });
}
