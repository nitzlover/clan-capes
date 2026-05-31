/**
 * Capes roster — every clan registered with this panel server, with
 * the cape file URL attached when one exists on disk.
 *
 * Used by /dashboard/capes to list rosters (clan tag, current cape,
 * delete button). Prefer the DB roster when DB is enabled; fall
 * back to the legacy file-system-driven shape (one row per *.png in
 * UPLOAD_DIR) so a pre-migration deploy still surfaces uploaded
 * capes.
 *
 * Every cape URL is versioned by file mtime so HTTP caches break
 * on every re-upload — same trick as the older code, kept verbatim.
 */

import fs from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server/auth';
import { listClansForServer } from '@/lib/server/clan-repo';
import { dbEnabled } from '@/lib/server/db';
import { CDN_PUBLIC_URL, UPLOAD_DIR } from '@/lib/server/env';
import { resolveServerId } from '@/lib/server/resolve-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CapeFileInfo = { mtimeMs: number; size: number };

async function indexCapeFiles(): Promise<Map<string, CapeFileInfo>> {
  const out = new Map<string, CapeFileInfo>();
  let files: string[] = [];
  try {
    files = (await fs.readdir(UPLOAD_DIR)).filter((f) =>
      f.toLowerCase().endsWith('.png'),
    );
  } catch {
    return out;
  }
  for (const file of files) {
    const tag = file.replace(/\.png$/i, '').toUpperCase();
    try {
      const stat = await fs.stat(`${UPLOAD_DIR}/${file}`);
      out.set(tag, { mtimeMs: stat.mtimeMs, size: stat.size });
    } catch {
      // ignore — missing between readdir and stat
    }
  }
  return out;
}

export async function GET(req: Request) {
  const user = requireAuth(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const cdn = CDN_PUBLIC_URL;
  const capeIndex = await indexCapeFiles();

  // DB roster path — every clan on the selected server, capeUrl
  // attached when the file exists.
  if (dbEnabled()) {
    // 1.0.16 fix: scope to the dashboard's ?serverId= instead of the
    // newest server, so the cape page roster matches the picker.
    const serverId = await resolveServerId(req);
    if (serverId) {
      const clans = await listClansForServer(serverId);
      if (clans.length > 0) {
        return NextResponse.json({
          source: 'db',
          clans: clans.map((c) => {
            const cape = capeIndex.get(c.tag);
            const capeUrl = cape
              ? `${cdn}/${c.tag}.png?v=${Math.floor(cape.mtimeMs)}`
              : null;
            return {
              tag: c.tag,
              name: c.name,
              colorHex: c.colorHex,
              capeUrl,
              updatedAt: cape?.mtimeMs ?? null,
              updatedBy: 'panel',
            };
          }),
        });
      }
    }
  }

  // Legacy fallback — one row per *.png. Kept so pre-migration deploys
  // (no DB, or DB empty) still see the uploaded capes on the page. The
  // CDN serves each file directly; mtime is the only metadata we have
  // without a DB row.
  const clans = [...capeIndex.entries()].map(([tag, info]) => {
    const v = Math.floor(info.mtimeMs);
    return {
      tag,
      capeUrl: `${cdn}/${tag}.png?v=${v}`,
      updatedAt: info.mtimeMs,
      updatedBy: 'panel',
    };
  });
  return NextResponse.json({ source: 'files', clans });
}
