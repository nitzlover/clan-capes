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
import { PANEL_PUBLIC_URL } from '@/lib/server/env';
import { readPluginLatest } from '@/lib/server/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Fallback when no jar has been uploaded to the Volume. Bump via the
// PLUGIN_LATEST_VERSION env var to announce a new build without a
// redeploy of the panel.
const DEFAULT_VERSION = '1.2.1';

export async function GET(req: Request) {
  const ctx = await requirePluginAuth(req);
  if (!ctx) {
    return NextResponse.json(
      { error: 'invalid or missing plugin API key' },
      { status: 401 },
    );
  }
  // Prefer a jar uploaded to the Volume — it's served as a direct 200 by
  // /api/plugin/download, which the plugin's non-redirect-following
  // auto-updater needs. Fall back to the env vars / baked default until a
  // jar is uploaded via /api/panel/plugin.
  const latest = await readPluginLatest();
  if (latest) {
    const origin = PANEL_PUBLIC_URL || new URL(req.url).origin;
    return NextResponse.json({
      latest: latest.version,
      downloadUrl: `${origin}/api/plugin/download`,
      size: latest.size,
      uploadedAt: latest.uploadedAt,
    });
  }
  return NextResponse.json({
    latest: process.env.PLUGIN_LATEST_VERSION || DEFAULT_VERSION,
    downloadUrl: process.env.PLUGIN_DOWNLOAD_URL || '',
  });
}
