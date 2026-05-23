import fs from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { UPLOAD_DIR } from '@/lib/server/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Public cape PNG server. The Fabric mod on every player's client fetches
 * capes from this URL — no auth, just bytes. Replaces the old Express
 * `app.use('/static/capes', express.static(...))` mount.
 *
 * Filename must be a bare `<TAG>.png` — no path traversal, no nested dirs.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  if (!/^[A-Za-z0-9_-]+\.png$/.test(file)) {
    return new NextResponse('invalid filename', { status: 400 });
  }
  const full = path.resolve(UPLOAD_DIR, file);
  // Defence in depth: make sure the resolved path is still inside UPLOAD_DIR.
  const dir = path.resolve(UPLOAD_DIR);
  if (!full.startsWith(dir + path.sep) && full !== dir) {
    return new NextResponse('forbidden', { status: 403 });
  }
  try {
    const buf = await fs.readFile(full);
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=604800, immutable',
      },
    });
  } catch {
    return new NextResponse('not found', { status: 404 });
  }
}
