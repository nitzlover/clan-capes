/**
 * Clan dropdown source for the Cape upload + Banner editor pages.
 *
 * Prefers the DB-backed roster when both DATABASE_URL is set AND at
 * least one clan exists in `clans`. Falls back to PowerClans via the
 * plugin REST so deploys mid-migration (no DB yet, or DB empty)
 * still see the legacy roster on the Banner / Upload pages.
 *
 * Always reads the cape directory off the local disk to mark each
 * clan with `hasCape` — cape ownership is file-based regardless of
 * which roster source is winning.
 */

import fs from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { desc } from 'drizzle-orm';
import { requireAuth } from '@/lib/server/auth';
import { listClansForServer } from '@/lib/server/clan-repo';
import { dbEnabled, getDb, schema } from '@/lib/server/db';
import { UPLOAD_DIR } from '@/lib/server/env';
import * as mc from '@/lib/server/minecraft';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const user = requireAuth(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let capeTags = new Set<string>();
  try {
    const files = (await fs.readdir(UPLOAD_DIR)).filter((f) =>
      f.toLowerCase().endsWith('.png'),
    );
    capeTags = new Set(files.map((f) => f.replace(/\.png$/i, '').toUpperCase()));
  } catch {
    capeTags = new Set();
  }

  // Preferred path: DB-backed roster. Picks the most-recently-registered
  // server when there are several (matches /dashboard/clans default).
  if (dbEnabled()) {
    try {
      const db = getDb();
      const [first] = await db
        .select({ id: schema.servers.id })
        .from(schema.servers)
        .orderBy(desc(schema.servers.createdAt))
        .limit(1);
      if (first) {
        const clans = await listClansForServer(first.id);
        if (clans.length > 0) {
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
      }
    } catch (e) {
      // Fall through to PowerClans fallback so a transient DB blip
      // doesn't blank the dropdown.
      console.warn('[clans/options] db read failed, falling back to PowerClans:', e);
    }
  }

  // Fallback: legacy PowerClans via the plugin REST.
  try {
    const powerClans = await mc.fetchPowerClans();
    return NextResponse.json({
      source: 'powerclans',
      clans: powerClans.map((c) => ({
        id: c.id,
        tag: c.tag,
        leader: c.leader,
        level: c.level,
        hasCape: capeTags.has(c.tag.toUpperCase()),
      })),
    });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : 'Failed to load PowerClans (is Paper API running?)',
      },
      { status: 502 },
    );
  }
}
