/**
 * Plugin-facing: list all active clans for the calling server.
 *
 * Auth: Bearer plugin API key — `requirePluginAuth` scopes the response
 * automatically to the server the key was issued for, so a plugin
 * on server A can't enumerate clans on server B.
 *
 * Response shape matches {@link ClanDto} per /lib/server/clan-repo —
 * the plugin caches these in memory and refreshes periodically.
 */

import { NextResponse } from 'next/server';
import { listClansForServer } from '@/lib/server/clan-repo';
import { dbEnabled } from '@/lib/server/db';
import { requirePluginAuth } from '@/lib/server/plugin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!dbEnabled()) {
    return NextResponse.json({ clans: [] });
  }
  const ctx = await requirePluginAuth(req);
  if (!ctx) {
    return NextResponse.json(
      { error: 'invalid or missing plugin API key' },
      { status: 401 },
    );
  }

  const clans = await listClansForServer(ctx.id);
  return NextResponse.json({ clans });
}
