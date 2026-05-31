/**
 * Clan dropdown source for the Cape upload + Banner editor pages.
 *
 * DB-backed only. The legacy PowerClans fallback was removed once
 * PowerClans was retired from the in-game stack — the DB roster is
 * the single source of truth for clan tags.
 *
 * Each clan is decorated with `hasCape` from a quick scan of the
 * upload directory so the dropdown can render a checkmark next to
 * tags that already have a cape file on disk.
 */

import fs from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server/auth';
import { listClansForServer } from '@/lib/server/clan-repo';
import { dbEnabled } from '@/lib/server/db';
import { UPLOAD_DIR } from '@/lib/server/env';
import { resolveServerId } from '@/lib/server/resolve-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const user = requireAuth(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (!dbEnabled()) {
    return NextResponse.json({ source: 'db', clans: [] });
  }

  let capeTags = new Set<string>();
  try {
    const files = (await fs.readdir(UPLOAD_DIR)).filter((f) =>
      f.toLowerCase().endsWith('.png'),
    );
    capeTags = new Set(files.map((f) => f.replace(/\.png$/i, '').toUpperCase()));
  } catch {
    capeTags = new Set();
  }

  // 1.0.16 fix: honour the dashboard's ?serverId= scope instead of
  // always picking the newest server. The banner editor + cape page
  // feed off this dropdown, so ignoring the picker made them show the
  // wrong server's clans (same class of bug as the cape-upload route,
  // audit H3 — that one was fixed but this sibling was missed).
  const serverId = await resolveServerId(req);
  if (!serverId) {
    return NextResponse.json({ source: 'db', clans: [] });
  }

  const clans = await listClansForServer(serverId);
  return NextResponse.json({
    source: 'db',
    clans: clans.map((c) => ({
      id: String(c.id),
      tag: c.tag,
      leader: c.leaderUuid,
      level: 0,
      hasCape: capeTags.has(c.tag.toUpperCase()),
    })),
  });
}
