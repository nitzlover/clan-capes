/**
 * Streams the latest uploaded Paper plugin jar from the Railway Volume.
 *
 * Public + DIRECT 200 (no redirect). The plugin's auto-updater builds a
 * java.net.http.HttpClient with the default Redirect.NEVER policy, so
 * PLUGIN_DOWNLOAD_URL must resolve straight to the jar bytes — a 3xx-ing
 * host (GitHub release, S3 presign) would make tryAutoDownload log
 * "Auto-download failed: HTTP 302". Serving off our own Volume keeps it
 * a clean 200. 404 until an operator uploads a jar via /api/panel/plugin.
 */

import fs from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { pluginJarPath, readPluginLatest } from '@/lib/server/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const latest = await readPluginLatest();
  if (!latest) {
    return NextResponse.json({ error: 'no plugin jar uploaded yet' }, { status: 404 });
  }
  try {
    const buf = await fs.readFile(pluginJarPath(latest.filename));
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': 'application/java-archive',
        'Content-Disposition': `attachment; filename="${latest.filename}"`,
        'Content-Length': String(buf.length),
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return NextResponse.json(
      { error: 'jar recorded in latest.json but missing on disk' },
      { status: 404 },
    );
  }
}
