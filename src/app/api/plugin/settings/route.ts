/**
 * Plugin-facing read of the live operator settings.
 *
 * Plugin polls every few minutes and caches the result. Bearer auth
 * (the plugin's own API key) — settings are operator-visible but
 * we don't expose them publicly.
 */

import { NextResponse } from 'next/server';
import { dbEnabled } from '@/lib/server/db';
import { requirePluginAuth } from '@/lib/server/plugin-auth';
import { getServerSettings } from '@/lib/server/settings-repo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
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

  const settings = await getServerSettings(ctx.id);
  return NextResponse.json({ serverId: ctx.id, settings });
}
