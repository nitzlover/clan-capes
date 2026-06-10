/**
 * Streams the latest uploaded client-mod jar from the Railway Volume.
 * Public — players download it after the /api/mod/version nag. 404 until
 * an operator uploads a jar via /api/panel/mod.
 */

import fs from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { limit } from '@/lib/server/rate-limit';
import { modJarPath, readModLatest } from '@/lib/server/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  // Public jar stream — cap per-IP so it can't be used to soak bandwidth.
  // Legit traffic is one download per player per release.
  if (!limit(req, 'mod-download', 20, 60_000)) {
    return NextResponse.json(
      { error: 'rate limited' },
      { status: 429, headers: { 'retry-after': '60' } },
    );
  }
  const latest = await readModLatest();
  if (!latest) {
    return NextResponse.json({ error: 'no mod jar uploaded yet' }, { status: 404 });
  }
  try {
    const buf = await fs.readFile(modJarPath(latest.filename));
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
