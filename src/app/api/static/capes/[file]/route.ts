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
export async function GET(req: Request, ctx: { params: Promise<{ file: string }> }) {
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
    const stat = await fs.stat(full);
    // ETag combines size + mtime — cheap, file-system level fingerprint.
    // Quoted per RFC 7232. A re-upload bumps mtime, so the ETag changes
    // and any cached copy is invalidated even without a URL rewrite.
    const etag = `"${stat.size}-${Math.floor(stat.mtimeMs)}"`;
    const ifNoneMatch = req.headers.get('if-none-match');
    if (ifNoneMatch && ifNoneMatch === etag) {
      // Browser already has the right bytes — 304 with no body. Repeat
      // the CORS + caching headers because intermediaries strip them
      // off 304s otherwise.
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: etag,
          'Cache-Control': 'public, max-age=300, must-revalidate',
          'Access-Control-Allow-Origin': '*',
          'Cross-Origin-Resource-Policy': 'cross-origin',
        },
      });
    }
    const buf = await fs.readFile(full);
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        // 5-minute max-age + must-revalidate (no `immutable`). The
        // previous immutable directive meant browsers cached the cape
        // forever and never rechecked, so a re-uploaded cape kept
        // rendering its old pixels on any client that had loaded it
        // once. The ETag lets the revalidation roundtrip return a
        // 304 so we don't actually pay for the bytes every 5 minutes.
        'Cache-Control': 'public, max-age=300, must-revalidate',
        ETag: etag,
        // Cape PNGs are loaded by skinview3d's TextureLoader, which
        // requests with `crossOrigin = 'anonymous'`. Without an
        // Access-Control-Allow-Origin response header the texture is
        // treated as "tainted" and Three.js silently refuses to upload
        // it to WebGL — the body renders but the cape stays missing.
        // Mojang's own cape host returns a wildcard CORS header for
        // the same reason. The bytes are already public (no auth on
        // this route), so a wildcard is the right scope.
        'Access-Control-Allow-Origin': '*',
        'Cross-Origin-Resource-Policy': 'cross-origin',
      },
    });
  } catch {
    return new NextResponse('not found', { status: 404 });
  }
}
