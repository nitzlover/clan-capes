import fs from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server/auth';
import { UPLOAD_DIR } from '@/lib/server/env';
import * as mc from '@/lib/server/minecraft';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const user = requireAuth(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let capeTags = new Set<string>();
  try {
    const files = (await fs.readdir(UPLOAD_DIR)).filter((f) => f.toLowerCase().endsWith('.png'));
    capeTags = new Set(files.map((f) => f.replace(/\.png$/i, '').toUpperCase()));
  } catch {
    capeTags = new Set();
  }

  try {
    const powerClans = await mc.fetchPowerClans();
    const clans = powerClans.map((c) => ({
      id: c.id,
      tag: c.tag,
      leader: c.leader,
      level: c.level,
      hasCape: capeTags.has(c.tag.toUpperCase()),
    }));
    return NextResponse.json({ clans });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to load PowerClans (is Paper API running?)' },
      { status: 502 }
    );
  }
}
