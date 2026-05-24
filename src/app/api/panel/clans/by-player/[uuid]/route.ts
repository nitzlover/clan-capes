/**
 * Public endpoint (no JWT). Resolves a player's clan + cape so the
 * login page can preview the cape on the 3D character while the user
 * is typing their nickname. The Fabric mod uses
 * `/api/static/capes/<TAG>.png` directly, so this endpoint is purely
 * a UX helper for the panel.
 *
 * Phase-2 cleanup: prefer the DB roster (getClanForPlayer) over the
 * legacy plugin REST. The DB row tells us the clan tag, then we
 * stat the cape file off disk to attach a CDN URL with the standard
 * mtime version-buster. Plugin-side fallback stays so a pre-migration
 * deploy keeps working.
 */

import fs from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { desc } from 'drizzle-orm';
import { getClanForPlayer } from '@/lib/server/clan-repo';
import { dbEnabled, getDb, schema } from '@/lib/server/db';
import { CDN_PUBLIC_URL, UPLOAD_DIR } from '@/lib/server/env';
import * as mc from '@/lib/server/minecraft';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ uuid: string }> }) {
  const { uuid } = await ctx.params;
  if (!/^[0-9a-fA-F-]{32,36}$/.test(uuid)) {
    return NextResponse.json({ error: 'invalid uuid' }, { status: 400 });
  }

  // DB path
  if (dbEnabled()) {
    try {
      const db = getDb();
      const [server] = await db
        .select({ id: schema.servers.id })
        .from(schema.servers)
        .orderBy(desc(schema.servers.createdAt))
        .limit(1);
      if (server) {
        const clan = await getClanForPlayer(server.id, uuid);
        if (clan) {
          // Attach the cape URL if the PNG actually exists on disk —
          // a clan without a cape PNG returns 404 like the legacy
          // path so the panel renders the "no cape" placeholder.
          try {
            const stat = await fs.stat(`${UPLOAD_DIR}/${clan.tag}.png`);
            const v = Math.floor(stat.mtimeMs);
            return NextResponse.json({
              uuid,
              clanTag: clan.tag,
              capeUrl: `${CDN_PUBLIC_URL}/${clan.tag}.png?v=${v}`,
              updatedAt: stat.mtimeMs,
              updatedBy: 'panel',
              source: 'db',
            });
          } catch {
            return NextResponse.json({ error: 'no cape' }, { status: 404 });
          }
        }
      }
    } catch (e) {
      console.warn('[by-player] DB lookup failed, falling back to plugin:', e);
    }
  }

  // Legacy plugin proxy
  try {
    const dto = await mc.fetchPlayerCape(uuid);
    if (!dto?.capeUrl) {
      return NextResponse.json({ error: 'no cape' }, { status: 404 });
    }
    return NextResponse.json({
      uuid,
      clanTag: dto.clanTag ?? null,
      capeUrl: dto.capeUrl,
      updatedAt: dto.updatedAt ?? 0,
      updatedBy: dto.updatedBy ?? null,
      source: 'plugin',
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'plugin unreachable' },
      { status: 503 },
    );
  }
}
