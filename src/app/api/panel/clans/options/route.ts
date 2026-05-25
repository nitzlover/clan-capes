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
import { desc } from 'drizzle-orm';
import { requireAuth } from '@/lib/server/auth';
import { listClansForServer } from '@/lib/server/clan-repo';
import { dbEnabled, getDb, schema } from '@/lib/server/db';
import { UPLOAD_DIR } from '@/lib/server/env';

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

  const db = getDb();
  const [first] = await db
    .select({ id: schema.servers.id })
    .from(schema.servers)
    .orderBy(desc(schema.servers.createdAt))
    .limit(1);
  if (!first) {
    return NextResponse.json({ source: 'db', clans: [] });
  }

  const clans = await listClansForServer(first.id);
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
