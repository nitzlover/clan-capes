/**
 * Client-mod update channel — the Fabric mod polls this on join and nags
 * the player when `latest` is newer than the version it's running.
 *
 * Public (the mod has no auth). Returns the version + an absolute download
 * URL pointing back at this panel's /api/mod/download (served off the same
 * Railway Volume the capes live on — no separate CDN). Before any jar has
 * been uploaded it falls back to the `MOD_LATEST_VERSION` env with an empty
 * downloadUrl, so the mod can still surface "update available" text.
 */

import { NextResponse } from 'next/server';
import { MOD_LATEST_VERSION, PANEL_PUBLIC_URL } from '@/lib/server/env';
import { readModLatest } from '@/lib/server/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const origin = PANEL_PUBLIC_URL || new URL(req.url).origin;
  const latest = await readModLatest();
  if (latest) {
    return NextResponse.json({
      latest: latest.version,
      downloadUrl: `${origin}/api/mod/download`,
      size: latest.size,
      uploadedAt: latest.uploadedAt,
    });
  }
  return NextResponse.json({ latest: MOD_LATEST_VERSION, downloadUrl: '' });
}
