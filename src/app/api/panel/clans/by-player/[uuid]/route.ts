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

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ uuid: string }> }) {
  const { uuid } = await ctx.params;
  if (!/^[0-9a-fA-F-]{32,36}$/.test(uuid)) {
    return NextResponse.json({ error: 'invalid uuid' }, { status: 400 });
  }

  // DB is the only source — the plugin consumes this API, it doesn't
  // serve a cape proxy. No clan / no cape file → clean 404 so the
  // panel renders the "no cape" placeholder.
  if (!dbEnabled()) {
    return NextResponse.json({ error: 'no cape' }, { status: 404 });
  }
  const db = getDb();
  const [server] = await db
    .select({ id: schema.servers.id })
    .from(schema.servers)
    .orderBy(desc(schema.servers.createdAt))
    .limit(1);
  if (!server) {
    return NextResponse.json({ error: 'no cape' }, { status: 404 });
  }
  const clan = await getClanForPlayer(server.id, uuid);
  if (!clan) {
    return NextResponse.json({ error: 'no cape' }, { status: 404 });
  }
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
