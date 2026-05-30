/**
 * Plugin update channel. The plugin polls this on enable and nags
 * admins if `latest` differs from the version it's running.
 *
 * Source: PLUGIN_LATEST_VERSION + PLUGIN_DOWNLOAD_URL env vars. When
 * unset, `latest` falls back to a baked default that matches the
 * shipped jar — so the nag stays silent until an operator bumps the
 * env var to announce a new build. Never serves the jar itself; the
 * download is a manual operator step (Bukkit hot-swap is unsafe).
 *
 * Plugin Bearer auth — same as the rest of /api/plugin/*.
 */

import { NextResponse } from 'next/server';
import { requirePluginAuth } from '@/lib/server/plugin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Matches the current shipped plugin version. Bump via the
// PLUGIN_LATEST_VERSION env var to announce a new build without a
// redeploy of the panel.
const DEFAULT_VERSION = '1.0.3';

export async function GET(req: Request) {
  const ctx = await requirePluginAuth(req);
  if (!ctx) {
    return NextResponse.json(
      { error: 'invalid or missing plugin API key' },
      { status: 401 },
    );
  }
  return NextResponse.json({
    latest: process.env.PLUGIN_LATEST_VERSION || DEFAULT_VERSION,
    downloadUrl: process.env.PLUGIN_DOWNLOAD_URL || '',
  });
}
